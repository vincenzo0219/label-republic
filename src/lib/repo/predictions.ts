/** 🎯 승부 예측 저장소 (11/2). 규칙은 src/lib/predictions.ts 맨 위 */
import { identityKey } from "../badges";
import { query } from "../db";
import { HttpError, notFound } from "../errors";
import { BOARD_TOP, correctRate, isPredictRoom, predictionProblem, resultPushText, streakOf, weekStart } from "../predictions";
import { sendPush, type PushMessage, type PushTarget, type SendResult } from "../push";

export type PredictionRow = {
  id: string; room: string; title: string; options: string[]; closes_at: string;
  answer: number | null; resolved_at: string | null; points: number; source_url: string | null;
};

export type OpenItem = { id: string; title: string; options: string[]; closesAt: string; mine: number | null; tally: number[] | null };
export type DoneItem = { id: string; title: string; options: string[]; answer: number; mine: number | null; ok: boolean | null; points: number; sourceUrl: string | null; rate: number | null };
export type MyScore = { score: number; wins: number; losses: number; streak: number };
export type BoardRow = { name: string; score: number; wins: number; me: boolean };
export type PredictCard = { room: string; open: OpenItem[]; recent: DoneItem[]; me: MyScore; board: BoardRow[] };

const COLS = "id::text, room, title, options, closes_at, answer, resolved_at, points, source_url";

async function tally(id: string, n: number): Promise<number[]> {
  const rows = await query<{ choice: number; c: number }>("SELECT choice, count(*)::int AS c FROM prediction_picks WHERE prediction_id = $1 GROUP BY choice", [id]);
  const out = Array.from({ length: n }, () => 0);
  for (const r of rows) if (r.choice >= 0 && r.choice < n) out[r.choice] = r.c;
  return out;
}

/** 한 사람(방문자 또는 닉네임 키)의 결과 난 판으로 점수·연속. scope 가 room 이면 그 방만, 없으면 전체 */
async function scoreOf(where: { visitor?: string; nickKey?: string }, room?: string): Promise<MyScore> {
  const cond = where.nickKey ? "p.nick_key = $1" : "p.visitor_hash = $1";
  const rows = await query<{ ok: boolean; points: number }>(
    `SELECT (p.choice = q.answer) AS ok, q.points
       FROM prediction_picks p JOIN predictions q ON q.id = p.prediction_id
      WHERE ${cond} AND q.answer IS NOT NULL ${room ? "AND q.room = $2" : ""}
      ORDER BY q.resolved_at DESC, q.id DESC`,
    room ? [where.nickKey ?? where.visitor, room] : [where.nickKey ?? where.visitor],
  );
  const oks = rows.map((r) => r.ok);
  return {
    score: rows.reduce((s, r) => s + (r.ok ? r.points : 0), 0),
    wins: oks.filter(Boolean).length,
    losses: oks.filter((x) => !x).length,
    streak: streakOf(oks),
  };
}

/** 🏆 이번 주 순위 (방 안). 닉네임 남긴 사람만 */
export async function predictBoard(room: string, myNickKey: string | null, now = new Date()): Promise<BoardRow[]> {
  const rows = await query<{ nick_key: string; name: string; score: number; wins: number }>(
    `SELECT p.nick_key, max(p.nickname) AS name,
            sum(CASE WHEN p.choice = q.answer THEN q.points ELSE 0 END)::int AS score,
            count(*) FILTER (WHERE p.choice = q.answer)::int AS wins
       FROM prediction_picks p JOIN predictions q ON q.id = p.prediction_id
      WHERE q.room = $1 AND q.answer IS NOT NULL AND q.resolved_at >= $2 AND p.nick_key IS NOT NULL
      GROUP BY p.nick_key HAVING sum(CASE WHEN p.choice = q.answer THEN q.points ELSE 0 END) > 0
      ORDER BY score DESC, wins DESC, p.nick_key LIMIT $3`,
    [room, weekStart(now), BOARD_TOP],
  );
  return rows.map((r) => ({ name: r.name, score: r.score, wins: r.wins, me: !!myNickKey && r.nick_key === myNickKey }));
}

export async function predictCard(room: string, visitor: string | null, nickname: string | null, now = new Date()): Promise<PredictCard> {
  if (!isPredictRoom(room)) throw notFound("예측 방");
  const nickKey = nickname ? identityKey(nickname) || null : null;
  const open = await query<PredictionRow>(
    `SELECT ${COLS} FROM predictions WHERE room = $1 AND answer IS NULL AND closes_at > $2 ORDER BY closes_at, id LIMIT 10`,
    [room, now.toISOString()],
  );
  const recent = await query<PredictionRow & { mine: number | null }>(
    `SELECT ${COLS}, (SELECT choice FROM prediction_picks x WHERE x.prediction_id = q.id AND x.visitor_hash = $2) AS mine
       FROM predictions q WHERE room = $1 AND answer IS NOT NULL ORDER BY resolved_at DESC, id DESC LIMIT 5`,
    [room, visitor ?? ""],
  );
  const mineOpen = visitor && open.length
    ? await query<{ prediction_id: string; choice: number }>(
        "SELECT prediction_id::text, choice FROM prediction_picks WHERE visitor_hash = $1 AND prediction_id = ANY($2::bigint[])",
        [visitor, open.map((o) => o.id)],
      )
    : [];
  const mineMap = new Map(mineOpen.map((m) => [m.prediction_id, m.choice]));
  const rates = new Map<string, number | null>();
  for (const r of recent) rates.set(r.id, correctRate(await tally(r.id, r.options.length), r.answer!));
  const openItems: OpenItem[] = [];
  for (const o of open) {
    const mine = mineMap.get(o.id) ?? null;
    openItems.push({ id: o.id, title: o.title, options: o.options, closesAt: new Date(o.closes_at).toISOString(), mine, tally: mine === null ? null : await tally(o.id, o.options.length) });
  }
  const me = nickKey ? await scoreOf({ nickKey }, room) : visitor ? await scoreOf({ visitor }, room) : { score: 0, wins: 0, losses: 0, streak: 0 };
  return {
    room,
    open: openItems,
    recent: recent.map((r) => ({
      id: r.id, title: r.title, options: r.options, answer: r.answer!, mine: r.mine,
      ok: r.mine === null ? null : r.mine === r.answer, points: r.points, sourceUrl: r.source_url, rate: rates.get(r.id) ?? null,
    })),
    me,
    board: await predictBoard(room, nickKey, now),
  };
}

/** 지금 고를 수 있는 문제가 하나라도 있는지 (11/5: 없으면 방 탭 줄에서 예측 탭을 숨긴다) */
export async function hasOpenPrediction(room: string, now = new Date()): Promise<boolean> {
  const [r] = await query<{ ok: boolean }>("SELECT EXISTS (SELECT 1 FROM predictions WHERE room = $1 AND answer IS NULL AND closes_at > $2) AS ok", [room, now.toISOString()]);
  return !!r?.ok;
}

/** 내 표에 이름 붙이기 (11/5: 닉네임은 첫 선택 뒤에 묻는다). 이 방에서 이름 없이 고른 내 표에만 */
export async function nameMyPicks(room: string, visitor: string, nickname: string): Promise<number> {
  const nick = nickname.trim().slice(0, 20);
  const key = nick ? identityKey(nick) || null : null;
  if (!nick || !key) throw new HttpError(400, "invalid_input", "닉네임을 적어 주세요");
  const rows = await query<{ id: string }>(
    `UPDATE prediction_picks p SET nickname = $3, nick_key = $4
       FROM predictions q
      WHERE q.id = p.prediction_id AND q.room = $1 AND p.visitor_hash = $2 AND p.nick_key IS NULL
      RETURNING p.prediction_id::text AS id`,
    [room, visitor, nick, key],
  );
  return rows.length;
}

/** 고르기: 마감 전, 한 브라우저 한 표 (바꿀 수 없음) */
export async function pickPrediction(input: { id: string; visitor: string; fp?: string | null; nickname?: string | null; choice: number }, now = new Date()): Promise<PredictCard> {
  if (!/^\d{1,18}$/.test(input.id)) throw notFound("예측 문제");
  const [q] = await query<PredictionRow>(`SELECT ${COLS} FROM predictions WHERE id = $1`, [input.id]);
  if (!q) throw notFound("예측 문제");
  if (q.answer !== null || new Date(q.closes_at).getTime() <= now.getTime()) throw new HttpError(409, "closed", "마감된 문제예요");
  if (!Number.isInteger(input.choice) || input.choice < 0 || input.choice >= q.options.length) throw new HttpError(400, "invalid_input", "보기를 골라 주세요");
  const nick = input.nickname?.trim().slice(0, 20) || null;
  await query(
    `INSERT INTO prediction_picks (prediction_id, visitor_hash, fp, nickname, nick_key, choice) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (prediction_id, visitor_hash) DO NOTHING`,
    [q.id, input.visitor, input.fp ?? null, nick, nick ? identityKey(nick) || null : null, input.choice],
  );
  return predictCard(q.room, input.visitor, nick, now);
}

/** 운영자: 문제 넣기 (seed_key 가 같으면 그대로 두고 그 문제를 돌려준다) */
export async function createPrediction(p: { room: string; title: string; options: string[]; closesAt: string; points?: number; seedKey?: string; sourceUrl?: string }): Promise<PredictionRow> {
  const problem = predictionProblem(p);
  if (problem) throw new HttpError(400, "invalid_input", problem);
  const rows = await query<PredictionRow>(
    `INSERT INTO predictions (room, title, options, closes_at, points, seed_key, source_url) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (seed_key) DO NOTHING RETURNING ${COLS}`,
    [p.room, p.title.trim(), p.options.map((o) => o.trim()), new Date(p.closesAt).toISOString(), p.points ?? 10, p.seedKey ?? null, p.sourceUrl ?? null],
  );
  if (rows[0]) return rows[0];
  const [old] = await query<PredictionRow>(`SELECT ${COLS} FROM predictions WHERE seed_key = $1`, [p.seedKey]);
  return old!;
}

/** 운영자: 결과 넣기·고치기. answer 가 null 이면 무효(문제 지움 대신 결과 비우기) */
export async function resolvePrediction(id: string, answer: number, sourceUrl?: string, opts: { notify?: boolean; send?: Send } = {}): Promise<PredictionRow & { notified?: number }> {
  const [q] = await query<PredictionRow>(`SELECT ${COLS} FROM predictions WHERE id = $1`, [id]);
  if (!q) throw notFound("예측 문제");
  if (!Number.isInteger(answer) || answer < 0 || answer >= q.options.length) throw new HttpError(400, "invalid_input", "answer 는 보기 번호(0부터)");
  const [r] = await query<PredictionRow>(
    `UPDATE predictions SET answer = $2, resolved_at = coalesce(resolved_at, now()), source_url = coalesce($3, source_url) WHERE id = $1 RETURNING ${COLS}`,
    [id, answer, sourceUrl ?? null],
  );
  // 🔔 결과 알림 (11/3): 처음 결과를 넣을 때만 한 번 (고칠 때는 다시 안 보냄)
  if (q.answer === null && opts.notify !== false) {
    const notified = await notifyResult(r!, opts.send).catch(() => 0);
    return { ...r!, notified };
  }
  return r!;
}

type Send = (target: PushTarget, msg: PushMessage) => Promise<SendResult>;

/** 이 문제를 고른 사람의 알림 구독(같은 브라우저 지문)으로 결과를 한 번씩 보낸다 */
async function notifyResult(q: PredictionRow, send: Send = (t, m) => sendPush(t, m)): Promise<number> {
  const subs = await query<{ id: string; endpoint: string; p256dh: string; auth: string; choice: number }>(
    `SELECT DISTINCT ON (s.id) s.id::text, s.endpoint, s.p256dh, s.auth, p.choice
       FROM prediction_picks p JOIN push_subscriptions s ON s.fingerprint = p.fp
      WHERE p.prediction_id = $1 AND p.fp IS NOT NULL
      ORDER BY s.id, p.created_at`,
    [q.id],
  );
  let sent = 0;
  for (const s of subs) {
    const t = resultPushText(q.title, q.options, q.answer!, s.choice, q.points);
    const r = await send(s, { ...t, url: `/c/${encodeURIComponent(q.room)}?tab=predict`, tag: `predict-${q.id}` }).catch(() => "failed" as const);
    if (r === "sent") sent++;
    if (r === "gone") await query("DELETE FROM push_subscriptions WHERE id = $1", [s.id]).catch(() => {});
  }
  return sent;
}

export async function deletePrediction(id: string): Promise<boolean> {
  const rows = await query<{ id: string }>("DELETE FROM predictions WHERE id = $1 RETURNING id::text", [id]);
  return !!rows[0];
}

/** 운영자 목록: 결과를 아직 안 넣은 것(마감 지난 것 먼저) + 최근 결과 */
export async function listPredictions(limit = 50): Promise<(PredictionRow & { picks: number })[]> {
  return query(
    `SELECT ${COLS}, (SELECT count(*)::int FROM prediction_picks p WHERE p.prediction_id = q.id) AS picks
       FROM predictions q ORDER BY (answer IS NULL) DESC, closes_at DESC LIMIT $1`,
    [Math.max(1, Math.min(200, limit))],
  );
}

/** 닉네임들의 연속·7일 안 적중 (배지용, 전체 방). 키: identityKey */
export async function predictStreaks(nickKeys: readonly string[]): Promise<Record<string, number>> {
  return Object.fromEntries(Object.entries(await predictStats(nickKeys)).map(([k, v]) => [k, v.streak]));
}

export async function predictStats(nickKeys: readonly string[], now = new Date()): Promise<Record<string, { streak: number; recentWin: boolean }>> {
  if (!nickKeys.length) return {};
  const rows = await query<{ nick_key: string; ok: boolean; resolved_at: string }>(
    `SELECT p.nick_key, (p.choice = q.answer) AS ok, q.resolved_at
       FROM prediction_picks p JOIN predictions q ON q.id = p.prediction_id
      WHERE p.nick_key = ANY($1::text[]) AND q.answer IS NOT NULL
      ORDER BY p.nick_key, q.resolved_at DESC, q.id DESC`,
    [nickKeys],
  );
  const since = now.getTime() - 7 * 86_400_000;
  const by = new Map<string, { oks: boolean[]; recentWin: boolean }>();
  for (const r of rows) {
    const e = by.get(r.nick_key) ?? { oks: [], recentWin: false };
    e.oks.push(r.ok);
    if (r.ok && new Date(r.resolved_at).getTime() >= since) e.recentWin = true;
    by.set(r.nick_key, e);
  }
  return Object.fromEntries([...by].map(([k, e]) => [k, { streak: streakOf(e.oks), recentWin: e.recentWin }]));
}

/** 🏆 지난주(월~일 KST) 방별 1등 닉네임 키 (점수 > 0, 같으면 먼저 그 점수에 닿은 사람) */
export async function lastWeekTop(room: string, now = new Date()): Promise<string | null> {
  const thisWeek = weekStart(now);
  const prev = new Date(new Date(thisWeek).getTime() - 7 * 86_400_000).toISOString();
  const [r] = await query<{ nick_key: string }>(
    `SELECT p.nick_key
       FROM prediction_picks p JOIN predictions q ON q.id = p.prediction_id
      WHERE q.room = $1 AND q.answer IS NOT NULL AND q.resolved_at >= $2 AND q.resolved_at < $3 AND p.nick_key IS NOT NULL AND p.choice = q.answer
      GROUP BY p.nick_key
      ORDER BY sum(q.points) DESC, max(q.resolved_at) ASC, p.nick_key LIMIT 1`,
    [room, prev, thisWeek],
  );
  return r?.nick_key ?? null;
}
