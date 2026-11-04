/** 🏆 전국 랭킹 · 🏁 지난 기록 도전 저장소 (11/4). 규칙은 src/lib/gameRank.ts. 기록은 game_plays 한 줄 = 한 판 */
import { query } from "../db";
import { competitionRanks, pickTarget, rankName, type RankGame, type RankPeriod, topPercent } from "../gameRank";
import { kstDay } from "../metrics";
import { GAMES } from "../miniGames";
import { kstWeekDay } from "../roomBoards";

export type RankRow = { rank: number; name: string; score: number; me: boolean };
export type MyRank = { rank: number; total: number; top: number; best: number };
export type Ranking = { game: RankGame; period: RankPeriod; total: number; rows: RankRow[]; me: MyRank | null };

const fromDay = (period: RankPeriod, now: Date): string | null => (period === "today" ? kstDay(now) : period === "week" ? kstWeekDay(now) : null);

type Best = { visitor_hash: string; best: number; nickname: string | null };

/** 기간 안 한 사람당 최고 기록 (좋은 순, 같으면 먼저 낸 사람 먼저) */
async function bests(game: RankGame, period: RankPeriod, now: Date): Promise<Best[]> {
  const low = GAMES[game].lowerBetter;
  const from = fromDay(period, now);
  const rows = await query<Best>(
    `SELECT visitor_hash, ${low ? "min" : "max"}(score)::int AS best,
            (array_agg(nickname ORDER BY created_at DESC) FILTER (WHERE nickname IS NOT NULL))[1] AS nickname,
            min(created_at) AS first_at
       FROM game_plays WHERE game = $1 ${from ? "AND day >= $2::date" : ""}
      GROUP BY visitor_hash
      ORDER BY best ${low ? "ASC" : "DESC"}, first_at ASC`,
    from ? [game, from] : [game],
  );
  return rows.map((r) => ({ visitor_hash: r.visitor_hash, best: Number(r.best), nickname: r.nickname }));
}

/** 🏆 전국 랭킹: top N + 내 순위 (같은 기록은 같은 순위) */
export async function gameRanking(game: RankGame, period: RankPeriod, visitor: string | null, now = new Date(), top = 10): Promise<Ranking> {
  const list = await bests(game, period, now);
  const ranks = competitionRanks(
    list.map((b) => b.best),
    GAMES[game].lowerBetter,
  );
  const rows = list.slice(0, top).map((b, i) => ({ rank: ranks[i]!, name: rankName(b.nickname, b.visitor_hash), score: b.best, me: visitor !== null && b.visitor_hash === visitor }));
  const mi = visitor ? list.findIndex((b) => b.visitor_hash === visitor) : -1;
  const me = mi >= 0 ? { rank: ranks[mi]!, total: list.length, top: topPercent(ranks[mi]!, list.length), best: list[mi]!.best } : null;
  return { game, period, total: list.length, rows, me };
}

export type Target = { name: string; score: number };

export type Challenge = { target: Target | null; myBest: number | null; others: number };

/** 🏁 도전할 다른 사람의 진짜 기록 하나 (전체 기간, 나는 빼고). 없으면 target null: 지어내지 않는다 (others 0 = 아직 기록 없음, myBest 있음 = 내가 1등) */
export async function challengeTarget(game: RankGame, visitor: string | null, now = new Date()): Promise<Challenge> {
  const list = await bests(game, "all", now);
  const myBest = visitor ? (list.find((b) => b.visitor_hash === visitor)?.best ?? null) : null;
  const others = list.filter((b) => b.visitor_hash !== visitor).map((b) => ({ score: b.best, name: rankName(b.nickname, b.visitor_hash) }));
  return { target: pickTarget(others, myBest, GAMES[game].lowerBetter), myBest, others: others.length };
}
