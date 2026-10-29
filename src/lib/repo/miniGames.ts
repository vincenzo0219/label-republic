/** 🎮 방 미니게임 저장소 (10/29). 규칙은 src/lib/miniGames.ts */
import { query } from "../db";
import { GAMES, type GameId, WORLDCUP_TRAITS } from "../miniGames";
import { kstDay } from "../metrics";

const agg = (game: GameId) => (GAMES[game].lowerBetter ? "min" : "max");

export type GameBoard = { myBest: number | null; todayBest: number | null };

/** 내 최고 기록(이 브라우저)과 오늘(KST) 이 방 최고 기록. 이름은 내보내지 않는다 */
export async function gameBoard(game: GameId, visitor: string | null, now = new Date()): Promise<GameBoard> {
  const f = agg(game);
  const [r] = await query<{ my: number | null; today: number | null }>(
    `SELECT (SELECT ${f}(score) FROM game_plays WHERE game = $1 AND visitor_hash = $2) AS my,
            (SELECT ${f}(score) FROM game_plays WHERE game = $1 AND day = $3) AS today`,
    [game, visitor ?? "", kstDay(now)],
  );
  return { myBest: visitor && r?.my != null ? Number(r.my) : null, todayBest: r?.today != null ? Number(r.today) : null };
}

export type WorldcupStat = { total: number; same: number; pct: number };

/** 💘 지금까지 끝까지 한 사람 중 같은 카드가 우승한 비율 */
export async function worldcupStat(winner: number): Promise<WorldcupStat> {
  const [r] = await query<{ total: number; same: number }>(
    "SELECT count(*)::int AS total, count(*) FILTER (WHERE score = $1)::int AS same FROM game_plays WHERE game = 'worldcup'",
    [winner],
  );
  const total = Number(r?.total ?? 0);
  const same = Number(r?.same ?? 0);
  return { total, same, pct: total ? Math.round((same / total) * 100) : 0 };
}

export type PlayResult = GameBoard & { best: boolean; worldcup?: WorldcupStat };

/** 한 판 저장. best = 이 브라우저 최고 기록을 새로 냈다 */
export async function recordPlay(game: GameId, visitor: string, score: number, now = new Date()): Promise<PlayResult> {
  const before = await gameBoard(game, visitor, now);
  await query("INSERT INTO game_plays (game, room, visitor_hash, score, day) VALUES ($1, $2, $3, $4, $5)", [game, GAMES[game].room, visitor, score, kstDay(now)]);
  if (game === "worldcup") return { myBest: null, todayBest: null, best: false, worldcup: await worldcupStat(score) };
  const after = await gameBoard(game, visitor, now);
  const best = before.myBest === null || (GAMES[game].lowerBetter ? score < before.myBest : score > before.myBest);
  return { ...after, best };
}

export async function recordOpen(game: GameId, visitor: string, src: "room" | "direct", now = new Date()): Promise<void> {
  await query("INSERT INTO game_opens (game, visitor_hash, src, day) VALUES ($1, $2, $3, $4)", [game, visitor, src, kstDay(now)]);
}

export type GameDayStat = { day: string; clicks: number; opens: number; plays: number; players: number };
export type GameStat = { game: GameId; name: string; days: GameDayStat[]; players: number; returning: number };

/** 관리자 🎮 미니게임: 날짜별 방 버튼 클릭·연 수·판 수·한 사람 수, 기간 안 2일 이상 한 사람 */
export async function gameStats(days = 7, now = new Date()): Promise<GameStat[]> {
  const to = kstDay(now);
  const from = kstDay(new Date(now.getTime() - (days - 1) * 86_400_000));
  const opens = await query<{ game: GameId; day: string; clicks: number; opens: number }>(
    `SELECT game, day::text, count(*) FILTER (WHERE src = 'room')::int AS clicks, count(*)::int AS opens
       FROM game_opens WHERE day BETWEEN $1 AND $2 GROUP BY 1, 2`,
    [from, to],
  );
  const plays = await query<{ game: GameId; day: string; plays: number; players: number }>(
    `SELECT game, day::text, count(*)::int AS plays, count(DISTINCT visitor_hash)::int AS players
       FROM game_plays WHERE day BETWEEN $1 AND $2 GROUP BY 1, 2`,
    [from, to],
  );
  const people = await query<{ game: GameId; players: number; returning: number }>(
    `SELECT game, count(*)::int AS players, count(*) FILTER (WHERE d >= 2)::int AS returning
       FROM (SELECT game, visitor_hash, count(DISTINCT day) AS d FROM game_plays WHERE day BETWEEN $1 AND $2 GROUP BY 1, 2) x
      GROUP BY 1`,
    [from, to],
  );
  const dayList: string[] = [];
  for (let i = 0; i < days; i++) dayList.push(kstDay(new Date(now.getTime() - i * 86_400_000)));
  return (Object.keys(GAMES) as GameId[]).map((game) => {
    const p = people.find((x) => x.game === game);
    return {
      game,
      name: `${GAMES[game].emoji} ${GAMES[game].name}`,
      players: Number(p?.players ?? 0),
      returning: Number(p?.returning ?? 0),
      days: dayList.map((day) => {
        const o = opens.find((x) => x.game === game && x.day === day);
        const pl = plays.find((x) => x.game === game && x.day === day);
        return { day, clicks: Number(o?.clicks ?? 0), opens: Number(o?.opens ?? 0), plays: Number(pl?.plays ?? 0), players: Number(pl?.players ?? 0) };
      }),
    };
  });
}

export const WORLDCUP_SIZE = WORLDCUP_TRAITS.length;
