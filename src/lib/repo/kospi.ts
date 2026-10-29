/**
 * 📈 코스피 맞히기 저장소 (10/29). 규칙은 src/lib/kospiGame.ts 맨 위.
 * 성적(kospi_stats)은 종가를 넣을 때마다 다시 계산한다: 고른 것은 마감 전에만 들어오니 결과가 바뀌는 건 종가뿐
 */
import { query, tx } from "../db";
import { HttpError } from "../errors";
import { dayLabel, KOSPI_ROOMS, lockAt, moveOf, questionDay, RANK_MIN_GAMES, RANK_TOP } from "../kospiGame";
import { kstDay } from "../metrics";
import { addNote } from "./roomQuizzes";

/** 결과 난 날: 바로 앞에 넣은 종가와 비교, 보합은 뺀다 */
const MOVES = `c AS (SELECT day, close, lag(close) OVER (ORDER BY day) AS prev FROM kospi_closes),
  r AS (SELECT day, sign(close - prev)::int AS move FROM c WHERE prev IS NOT NULL AND close <> prev)`;
/** 키마다 결과 난 판 (같은 지문이 여러 브라우저면 그 날 처음 고른 것) */
const GAMES = `${MOVES},
  k AS (SELECT DISTINCT ON (x.key, p.day) x.key, p.day, (p.side = r.move) AS ok
          FROM kospi_picks p JOIN r ON r.day = p.day
          CROSS JOIN LATERAL (VALUES ('v:' || p.visitor_hash), ('f:' || p.fp)) AS x(key)
         WHERE x.key IS NOT NULL ORDER BY x.key, p.day, p.created_at)`;

export type KospiStats = { wins: number; losses: number; streak: number };
const NO_STATS: KospiStats = { wins: 0, losses: 0, streak: 0 };

/** 성적 다시 계산 (전부) */
export async function recomputeKospiStats(): Promise<void> {
  await tx(async (client) => {
    await client.query("DELETE FROM kospi_stats");
    await client.query(
      `WITH ${GAMES},
       n AS (SELECT key, ok, row_number() OVER (PARTITION BY key ORDER BY day DESC) AS rn FROM k)
       INSERT INTO kospi_stats (key, wins, losses, streak)
       SELECT key, count(*) FILTER (WHERE ok)::int, count(*) FILTER (WHERE NOT ok)::int,
              coalesce(min(rn) FILTER (WHERE NOT ok) - 1, count(*))::int
         FROM n GROUP BY key`,
    );
  });
}

/** 운영자: 종가 넣기·고치기 (평일만) → 성적 다시 계산 */
export async function putKospiClose(day: string, close: number): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new HttpError(400, "invalid_input", "day 는 YYYY-MM-DD");
  if (!(close > 0 && close < 100000)) throw new HttpError(400, "invalid_input", "close 를 확인하세요");
  await query(
    "INSERT INTO kospi_closes (day, close) VALUES ($1, $2) ON CONFLICT (day) DO UPDATE SET close = EXCLUDED.close, updated_at = now()",
    [day, close],
  );
  await recomputeKospiStats();
}

export async function listKospiCloses(limit = 30): Promise<{ day: string; close: number; move: number | null; picks: number }[]> {
  return query(
    `WITH c AS (SELECT day, close, lag(close) OVER (ORDER BY day) AS prev FROM kospi_closes)
     SELECT c.day::text AS day, c.close::float AS close, CASE WHEN c.prev IS NULL THEN NULL ELSE sign(c.close - c.prev)::int END AS move,
            (SELECT count(*)::int FROM kospi_picks p WHERE p.day = c.day) AS picks
       FROM c ORDER BY c.day DESC LIMIT $1`,
    [Math.max(1, Math.min(365, limit))],
  );
}

export type KospiTally = { up: number; down: number };

async function tally(day: string): Promise<KospiTally> {
  const [r] = await query<KospiTally>(
    "SELECT count(*) FILTER (WHERE side = 1)::int AS up, count(*) FILTER (WHERE side = -1)::int AS down FROM kospi_picks WHERE day = $1",
    [day],
  );
  return r ?? { up: 0, down: 0 };
}

export type KospiLast = { day: string; label: string; mine: 1 | -1; move: 1 | -1 | 0 | null; ok: boolean | null };

export type KospiCard = {
  day: string;
  label: string;
  lockAt: string;
  mine: 1 | -1 | null;
  /** 고른 뒤에만 */
  tally: KospiTally | null;
  last: KospiLast | null;
  stats: KospiStats;
};

/** 카드: 지금 문제, 내가 고른 것, 지난 판 결과, 내 성적. 지난 판을 맞혔으면 🃏 카드 한 장 (한 번만) */
export async function kospiCard(visitor: string | null, now = new Date()): Promise<KospiCard> {
  const day = questionDay(now);
  const card: KospiCard = { day, label: dayLabel(day), lockAt: lockAt(day), mine: null, tally: null, last: null, stats: NO_STATS };
  if (!visitor) return card;
  const [mine] = await query<{ side: 1 | -1 }>("SELECT side FROM kospi_picks WHERE day = $1 AND visitor_hash = $2", [day, visitor]);
  if (mine) {
    card.mine = mine.side;
    card.tally = await tally(day);
  }
  const [last] = await query<{ day: string; side: 1 | -1; room: string; close: number | null; prev: number | null }>(
    `SELECT p.day::text AS day, p.side, p.room, c.close::float AS close,
            (SELECT x.close::float FROM kospi_closes x WHERE x.day < p.day ORDER BY x.day DESC LIMIT 1) AS prev
       FROM kospi_picks p LEFT JOIN kospi_closes c ON c.day = p.day
      WHERE p.visitor_hash = $1 AND p.day < $2 ORDER BY p.day DESC LIMIT 1`,
    [visitor, day],
  );
  if (last) {
    const move = last.close === null || last.prev === null ? null : moveOf(last.prev, last.close);
    const ok = move === null || move === 0 ? null : move === last.side;
    card.last = { day: last.day, label: dayLabel(last.day), mine: last.side, move, ok };
    if (ok)
      await addNote(visitor, last.room, last.day, {
        kind: "trivia",
        question: `📈 ${dayLabel(last.day)} 코스피 맞히기`,
        answer: move === 1 ? "올랐어요" : "내렸어요",
        why: "맞혔어요",
        correct: true,
      });
  }
  const [s] = await query<KospiStats>("SELECT wins, losses, streak FROM kospi_stats WHERE key = $1", [`v:${visitor}`]);
  if (s) card.stats = s;
  return card;
}

/** 고르기: 지금 문제에 한 브라우저 하나 (두 번째부터는 첫 선택 그대로) */
export async function pickKospi(
  input: { visitor: string; fp?: string | null; nickname?: string | null; room: string; side: 1 | -1 },
  now = new Date(),
): Promise<KospiCard> {
  if (!KOSPI_ROOMS.has(input.room)) throw new HttpError(404, "no_game", "이 방에는 코스피 맞히기가 없어요");
  const day = questionDay(now);
  await query(
    `INSERT INTO kospi_picks (day, visitor_hash, fp, nickname, room, side) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (day, visitor_hash) DO NOTHING`,
    [day, input.visitor, input.fp ?? null, input.nickname?.trim().slice(0, 20) || null, input.room, input.side],
  );
  return kospiCard(input.visitor, now);
}

/** 순위에는 닉네임과 이번 달 맞힌 수만 (다른 사람 승패·배지는 보이지 않는다, 10/29) */
export type RankRow = { name: string; wins: number; me: boolean };

/** 🏆 이번 달(KST) 순위: 결과 난 판 RANK_MIN_GAMES 이상, 많이 맞힌 순, 같으면 덜 틀린 순 */
export async function kospiRanking(visitor: string | null, now = new Date()): Promise<RankRow[]> {
  const month = kstDay(now).slice(0, 7);
  const rows = await query<{ key: string; wins: number; nickname: string | null }>(
    `WITH ${GAMES}
     SELECT k.key, count(*) FILTER (WHERE k.ok)::int AS wins, count(*) FILTER (WHERE NOT k.ok)::int AS losses,
            (SELECT p.nickname FROM kospi_picks p WHERE 'v:' || p.visitor_hash = k.key AND p.nickname IS NOT NULL ORDER BY p.day DESC LIMIT 1) AS nickname
       FROM k WHERE k.key LIKE 'v:%' AND to_char(k.day, 'YYYY-MM') = $1
      GROUP BY k.key HAVING count(*) >= $2
      ORDER BY wins DESC, losses ASC, k.key LIMIT $3`,
    [month, RANK_MIN_GAMES, RANK_TOP],
  );
  return rows.map((r) => ({
    name: r.nickname ?? `손님 ${r.key.slice(2, 6)}`,
    wins: r.wins,
    me: visitor !== null && r.key === `v:${visitor}`,
  }));
}
