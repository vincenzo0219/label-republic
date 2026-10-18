import { heuristicAbuse, maskPersonalInfo } from "../abuse";
import { type BookDetail, type BookRead, type BookStatus, type BookSummary, bookKey, completionRate, normText } from "../books";
import { query, tx } from "../db";
import { HttpError, notFound } from "../errors";
import { isReservedNickname } from "../validation";

const SUMMARY = `b.id::text, b.title, b.author, b.last_read_at,
  count(r.id) FILTER (WHERE r.status = 'reading')::int AS reading,
  count(r.id) FILTER (WHERE r.status = 'done')::int AS done,
  count(r.id) FILTER (WHERE r.status = 'dropped')::int AS dropped`;

/** 최근 기록이 있는 순 (Sprint 62) */
export async function listBooks(limit = 60): Promise<BookSummary[]> {
  return query<BookSummary>(
    `SELECT ${SUMMARY} FROM books b LEFT JOIN book_reads r ON r.book_id = b.id
      GROUP BY b.id ORDER BY b.last_read_at DESC, b.id DESC LIMIT $1`,
    [limit],
  );
}

/** 책 카드 만들기 — 같은 제목·저자(띄어쓰기·기호 무시)가 있으면 그 카드를 돌려준다 */
export async function createBook(title: string, author: string, fingerprint: string | null): Promise<{ id: string; created: boolean }> {
  if (!normText(title)) throw new HttpError(400, "invalid_input", "제목을 입력해 주세요.");
  if (heuristicAbuse(title, author)) throw new HttpError(400, "invalid_input", "제목이나 저자에 쓸 수 없는 표현이 있어요.");
  const key = bookKey(title, author);
  const rows = await query<{ id: string; created: boolean }>(
    `WITH ins AS (
       INSERT INTO books (title, author, norm_key, title_norm, creator_fingerprint) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (norm_key) DO NOTHING RETURNING id::text
     )
     SELECT id, true AS created FROM ins
     UNION ALL SELECT id::text, false FROM books WHERE norm_key = $3 AND NOT EXISTS (SELECT 1 FROM ins)`,
    [title, author, key, normText(title), fingerprint],
  );
  return rows[0]!;
}

export async function getBook(id: string, fingerprint: string | null): Promise<BookDetail | null> {
  if (!/^\d{1,18}$/.test(id)) return null;
  const [summary] = await query<BookSummary>(`SELECT ${SUMMARY} FROM books b LEFT JOIN book_reads r ON r.book_id = b.id WHERE b.id = $1 GROUP BY b.id`, [id]);
  if (!summary) return null;
  const [reads, drop, next, editions, askedIn] = await Promise.all([
    query<BookRead>(
      `SELECT id::text, nickname, status, progress, CASE WHEN hidden_reason IS NULL THEN line ELSE '' END AS line,
              CASE WHEN hidden_reason IS NULL THEN next_title ELSE '' END AS next_title,
              CASE WHEN hidden_reason IS NULL THEN edition ELSE '' END AS edition,
              hidden_reason IS NOT NULL AS hidden, updated_at, ($2::text IS NOT NULL AND reader_fingerprint = $2::text) AS mine
         FROM book_reads WHERE book_id = $1 ORDER BY updated_at DESC LIMIT 200`,
      [id, fingerprint],
    ),
    query<{ avg: number | null }>("SELECT avg(progress)::float AS avg FROM book_reads WHERE book_id = $1 AND status = 'dropped'", [id]),
    // 다음 책: 가장 많이 쓰인 표기로 보여 주고, 노방장에 같은 제목 카드가 있으면 잇는다
    query<{ title: string; count: number; book_id: string | null }>(
      `SELECT (array_agg(next_title ORDER BY updated_at DESC))[1] AS title, count(*)::int AS count,
              (SELECT b.id::text FROM books b WHERE b.title_norm = r.next_norm ORDER BY b.id LIMIT 1) AS book_id
         FROM book_reads r WHERE book_id = $1 AND next_norm <> '' AND hidden_reason IS NULL
        GROUP BY next_norm ORDER BY count DESC, max(updated_at) DESC LIMIT 5`,
      [id],
    ),
    query<{ edition: string; total: number; done: number; dropped: number }>(
      `SELECT (array_agg(edition ORDER BY updated_at DESC))[1] AS edition, count(*)::int AS total,
              count(*) FILTER (WHERE status = 'done')::int AS done, count(*) FILTER (WHERE status = 'dropped')::int AS dropped
         FROM book_reads WHERE book_id = $1 AND edition_norm <> '' AND hidden_reason IS NULL
        GROUP BY edition_norm ORDER BY total DESC LIMIT 8`,
      [id],
    ),
    query<{ id: string; situation: string; count: number }>(
      `SELECT a.id::text, a.situation, count(*)::int AS count FROM book_ask_answers x JOIN book_asks a ON a.id = x.ask_id
        WHERE x.book_id = $1 AND x.hidden_reason IS NULL AND a.hidden_reason IS NULL
        GROUP BY a.id ORDER BY count DESC, a.id DESC LIMIT 8`,
      [id],
    ),
  ]);
  return {
    ...summary,
    rate: completionRate(summary.done, summary.dropped),
    dropAt: drop[0]?.avg == null ? null : Math.round(drop[0].avg),
    nextBooks: next.map((n) => ({ title: n.title, count: n.count, bookId: n.book_id === id ? null : n.book_id })),
    reads,
    editions: editions.map((e) => ({ ...e, rate: completionRate(e.done, e.dropped) })),
    askedIn,
  };
}

export type BookReadInput = { status: BookStatus; progress: number; line: string; nextTitle: string; nickname: string; edition?: string };

/** 내 기록 남기기·고치기 — 한 사람이 책 하나에 기록 하나 */
export async function saveBookRead(bookId: string, fingerprint: string, input: BookReadInput): Promise<{ created: boolean }> {
  if (!/^\d{1,18}$/.test(bookId)) throw notFound("책");
  if (isReservedNickname(input.nickname)) throw new HttpError(400, "invalid_input", "운영자·AI 큐레이터로 오인될 수 있는 닉네임은 쓸 수 없어요.");
  // 연락처·계좌 같은 개인정보는 가리고, 분명한 욕설·혐오는 한 줄만 가린다 (기록은 통계에 남는다)
  const line = maskPersonalInfo(input.line).text;
  const nextTitle = maskPersonalInfo(input.nextTitle).text;
  const edition = maskPersonalInfo(input.edition ?? "").text;
  const abuse = heuristicAbuse(line, nextTitle, edition, input.nickname);
  return tx(async (client) => {
    const { rows: book } = await client.query("SELECT 1 FROM books WHERE id = $1 FOR UPDATE", [bookId]);
    if (!book[0]) throw notFound("책");
    const { rows } = await client.query<{ created: boolean }>(
      `INSERT INTO book_reads (book_id, reader_fingerprint, nickname, status, progress, line, next_title, next_norm, hidden_reason, edition, edition_norm)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (book_id, reader_fingerprint) DO UPDATE
         SET nickname = EXCLUDED.nickname, status = EXCLUDED.status, progress = EXCLUDED.progress, line = EXCLUDED.line,
             next_title = EXCLUDED.next_title, next_norm = EXCLUDED.next_norm, hidden_reason = EXCLUDED.hidden_reason,
             edition = EXCLUDED.edition, edition_norm = EXCLUDED.edition_norm, updated_at = now()
       RETURNING (xmax = 0) AS created`,
      [bookId, fingerprint, input.nickname, input.status, input.progress, line, nextTitle, normText(nextTitle), abuse?.category ?? null, edition, normText(edition)],
    );
    await client.query("UPDATE books SET last_read_at = now() WHERE id = $1", [bookId]);
    return rows[0]!;
  });
}

/** 📖 지금 읽는 책 한 줄 (Sprint 82) — 독서 단톡방에서 반응이 가장 잘 붙는 "자기 이야기 + 읽는 책"을 한 줄로 */
export type ReadingLine = { id: string; book_id: string; title: string; nickname: string; line: string; readers: number; updated_at: string };

export async function readingLines(limit = 20): Promise<ReadingLine[]> {
  return query<ReadingLine>(
    `SELECT r.id::text, b.id::text AS book_id, b.title, r.nickname, r.line, r.updated_at,
            (SELECT count(*)::int FROM book_reads x WHERE x.book_id = b.id) AS readers
       FROM book_reads r JOIN books b ON b.id = r.book_id
      WHERE r.line <> '' AND r.hidden_reason IS NULL
      ORDER BY r.updated_at DESC LIMIT $1`,
    [limit],
  );
}

/** 제목과 한마디만으로 "읽는 중" 기록 — 책 카드가 없으면 만든다 */
export async function quickRead(fingerprint: string, input: { title: string; line: string; nickname: string }): Promise<{ bookId: string }> {
  const { id } = await createBook(input.title, "", fingerprint);
  await saveBookRead(id, fingerprint, { status: "reading", progress: 0, line: input.line, nextTitle: "", nickname: input.nickname });
  return { bookId: id };
}

/** 📖 나도 읽었어요 — 이미 내 기록이 있으면 그대로 두고 읽은 사람 수만 돌려준다 */
export async function meToo(bookId: string, fingerprint: string, nickname: string): Promise<number> {
  if (!/^\d{1,18}$/.test(bookId)) throw notFound("책");
  if (isReservedNickname(nickname)) throw new HttpError(400, "invalid_input", "운영자·AI 큐레이터로 오인될 수 있는 닉네임은 쓸 수 없어요.");
  const [book] = await query<{ id: string }>("SELECT id::text FROM books WHERE id = $1", [bookId]);
  if (!book) throw notFound("책");
  await query(
    `INSERT INTO book_reads (book_id, reader_fingerprint, nickname, status, progress) VALUES ($1, $2, $3, 'done', 100)
     ON CONFLICT (book_id, reader_fingerprint) DO NOTHING`,
    [bookId, fingerprint, nickname],
  );
  const [r] = await query<{ n: number }>("SELECT count(*)::int AS n FROM book_reads WHERE book_id = $1", [bookId]);
  return r!.n;
}
