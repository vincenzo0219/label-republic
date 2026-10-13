import { heuristicAbuse, maskPersonalInfo } from "../abuse";
import { type BookAskDetail, type BookAskSummary, normText } from "../books";
import { query, tx } from "../db";
import { HttpError, notFound } from "../errors";
import { isReservedNickname } from "../validation";
import { createBook } from "./books";

function checkNickname(n: string) {
  if (isReservedNickname(n)) throw new HttpError(400, "invalid_input", "운영자·AI 큐레이터로 오인될 수 있는 닉네임은 쓸 수 없어요.");
}

/** 상황별 추천 목록 — 최근 추천이 달린 순, 상위 책 3권까지 (Sprint 63) */
export async function listAsks(limit = 60): Promise<BookAskSummary[]> {
  return query<BookAskSummary>(
    `SELECT a.id::text, a.situation, a.detail, a.nickname, a.last_answer_at,
            count(DISTINCT x.book_id)::int AS books, count(x.id)::int AS answers,
            coalesce((SELECT array_agg(t.title ORDER BY t.n DESC, t.title) FROM (
               SELECT b.title, count(*) AS n FROM book_ask_answers y JOIN books b ON b.id = y.book_id
                WHERE y.ask_id = a.id AND y.hidden_reason IS NULL GROUP BY b.id ORDER BY n DESC LIMIT 3) t), '{}') AS top
       FROM book_asks a LEFT JOIN book_ask_answers x ON x.ask_id = a.id AND x.hidden_reason IS NULL
      WHERE a.hidden_reason IS NULL
      GROUP BY a.id ORDER BY a.last_answer_at DESC, a.id DESC LIMIT $1`,
    [limit],
  );
}

/** 상황 만들기 — 같은 상황(띄어쓰기·기호 무시)이 있으면 그 상황으로 */
export async function createAsk(
  input: { situation: string; detail: string; nickname: string },
  fingerprint: string | null,
): Promise<{ id: string; created: boolean }> {
  checkNickname(input.nickname);
  const norm = normText(input.situation);
  if (norm.length < 2) throw new HttpError(400, "invalid_input", "어떤 상황인지 적어 주세요.");
  const situation = maskPersonalInfo(input.situation).text;
  const detail = maskPersonalInfo(input.detail).text;
  if (heuristicAbuse(situation, input.nickname)) throw new HttpError(400, "invalid_input", "쓸 수 없는 표현이 있어요.");
  const hidden = heuristicAbuse(detail)?.category ?? null;
  const rows = await query<{ id: string; created: boolean }>(
    `WITH ins AS (
       INSERT INTO book_asks (situation, situation_norm, detail, nickname, asker_fingerprint, hidden_reason)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (situation_norm) DO NOTHING RETURNING id::text
     )
     SELECT id, true AS created FROM ins
     UNION ALL SELECT id::text, false FROM book_asks WHERE situation_norm = $2 AND NOT EXISTS (SELECT 1 FROM ins)`,
    [situation, norm, hidden ? "" : detail, input.nickname, fingerprint, null],
  );
  return rows[0]!;
}

export async function getAsk(id: string, fingerprint: string | null): Promise<BookAskDetail | null> {
  if (!/^\d{1,18}$/.test(id)) return null;
  const [ask] = await query<BookAskSummary & { hidden: boolean }>(
    `SELECT a.id::text, a.situation, a.detail, a.nickname, a.last_answer_at, a.hidden_reason IS NOT NULL AS hidden,
            count(DISTINCT x.book_id)::int AS books, count(x.id)::int AS answers, '{}'::text[] AS top
       FROM book_asks a LEFT JOIN book_ask_answers x ON x.ask_id = a.id AND x.hidden_reason IS NULL
      WHERE a.id = $1 GROUP BY a.id`,
    [id],
  );
  if (!ask) return null;
  const rows = await query<{ book_id: string; title: string; author: string; nickname: string; reason: string; hidden: boolean; mine: boolean }>(
    `SELECT b.id::text AS book_id, b.title, b.author, x.nickname, CASE WHEN x.hidden_reason IS NULL THEN x.reason ELSE '' END AS reason,
            x.hidden_reason IS NOT NULL AS hidden, ($2::text IS NOT NULL AND x.answer_fingerprint = $2::text) AS mine
       FROM book_ask_answers x JOIN books b ON b.id = x.book_id WHERE x.ask_id = $1 ORDER BY x.created_at`,
    [id, fingerprint],
  );
  const picks = new Map<string, BookAskDetail["picks"][number]>();
  for (const r of rows) {
    if (r.hidden) continue;
    const p = picks.get(r.book_id) ?? { bookId: r.book_id, title: r.title, author: r.author, count: 0, mine: false, reasons: [] };
    p.count += 1;
    p.mine ||= r.mine;
    if (r.reason) p.reasons.push({ nickname: r.nickname, reason: r.reason });
    picks.set(r.book_id, p);
  }
  return { ...ask, picks: [...picks.values()].sort((a, b) => b.count - a.count) };
}

/** 추천 달기 — 책 카드가 없으면 만들고 잇는다. 같은 사람이 같은 책을 다시 추천하면 이유만 고친다. */
export async function answerAsk(
  askId: string,
  fingerprint: string,
  input: { title: string; author: string; reason: string; nickname: string },
): Promise<{ created: boolean; bookId: string }> {
  if (!/^\d{1,18}$/.test(askId)) throw notFound("상황");
  checkNickname(input.nickname);
  const [ask] = await query<{ id: string }>("SELECT id::text FROM book_asks WHERE id = $1 AND hidden_reason IS NULL", [askId]);
  if (!ask) throw notFound("상황");
  const { id: bookId } = await createBook(input.title, input.author, fingerprint);
  const reason = maskPersonalInfo(input.reason).text;
  const hidden = heuristicAbuse(reason, input.nickname)?.category ?? null;
  return tx(async (client) => {
    const { rows } = await client.query<{ created: boolean }>(
      `INSERT INTO book_ask_answers (ask_id, book_id, reason, nickname, answer_fingerprint, hidden_reason)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (ask_id, book_id, answer_fingerprint) DO UPDATE
         SET reason = EXCLUDED.reason, nickname = EXCLUDED.nickname, hidden_reason = EXCLUDED.hidden_reason
       RETURNING (xmax = 0) AS created`,
      [askId, bookId, reason, input.nickname, fingerprint, hidden],
    );
    await client.query("UPDATE book_asks SET last_answer_at = now() WHERE id = $1", [askId]);
    return { created: rows[0]!.created, bookId };
  });
}
