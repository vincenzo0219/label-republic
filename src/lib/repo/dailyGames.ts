/**
 * 🎯 하루 한 판 게임 재방문 장치 저장소 (11/4). 규칙은 src/lib/dailyGames.ts.
 * 기록은 game_plays 한 줄 = 그날 랭킹에 들어간 첫 판 (하루 게임은 다시 하기를 저장하지 않는다).
 */
import { identityKey } from "../badges";
import { DAILY, bookTeamName, deltaVsYesterday, LOW_POP, streakOf, teamTable, validTeam, type DailyGame, type TeamRow } from "../dailyGames";
import { query } from "../db";
import { HttpError } from "../errors";
import { competitionRanks, topPercent } from "../gameRank";
import { kstDay } from "../metrics";
import { GAMES } from "../miniGames";
import { kstWeekDay } from "../roomBoards";
import { subscriptionIdFor } from "./push";

const prevDay = (day: string, n = 1) => new Date(Date.parse(`${day}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

/**
 * 오늘 첫 판이면 랭킹에 남긴다 (ranked true). 같은 사람이 동시에 두 번 보내도 한 줄만 남도록 INSERT … WHERE NOT EXISTS.
 */
export async function insertDailyPlay(game: DailyGame, visitor: string, score: number, nickname: string | null, now = new Date()): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `INSERT INTO game_plays (game, room, visitor_hash, score, day, nickname)
     SELECT $1::varchar, $2::varchar, $3::text, $4::int, $5::date, $6::varchar
      WHERE NOT EXISTS (SELECT 1 FROM game_plays WHERE game = $1::varchar AND visitor_hash = $3::text AND day = $5::date)
     RETURNING id::text`,
    [game, GAMES[game].room, visitor, score, kstDay(now), nickname],
  );
  return rows.length > 0;
}

/** 오늘(KST) 이 사람이 랭킹에 남긴 기록 (없으면 null) */
export async function todayDailyScore(game: DailyGame, visitor: string | null, now = new Date()): Promise<number | null> {
  if (!visitor) return null;
  const [r] = await query<{ score: number }>("SELECT score FROM game_plays WHERE game = $1 AND visitor_hash = $2 AND day = $3 ORDER BY created_at LIMIT 1", [game, visitor, kstDay(now)]);
  return r ? Number(r.score) : null;
}

/** 이 사람의 편 (책: 독서 타입 테스트 결과, 그 밖: 고른 편) */
async function teamOf(game: DailyGame, visitor: string): Promise<string | null> {
  if (game === "booksent") {
    const [r] = await query<{ type_key: string }>("SELECT type_key FROM type_test_results WHERE test_key = 'book-sentence' AND visitor_hash = $1", [visitor]);
    return r ? (bookTeamName(r.type_key) ?? null) : null;
  }
  const [r] = await query<{ team: string }>("SELECT team FROM game_teams WHERE game = $1 AND visitor_hash = $2", [game, visitor]);
  return r?.team ?? null;
}

/** 편 고르기 (책은 테스트 결과라 고르지 않는다). 다시 고르면 바꾼다 */
export async function setDailyTeam(game: DailyGame, visitor: string, team: string): Promise<void> {
  if (game === "booksent" || !validTeam(game, team)) throw new HttpError(400, "bad_team", "고를 수 없는 편이에요");
  await query(
    `INSERT INTO game_teams (game, visitor_hash, team) VALUES ($1, $2, $3)
     ON CONFLICT (game, visitor_hash) DO UPDATE SET team = EXCLUDED.team, updated_at = now()`,
    [game, visitor, team],
  );
}

/** 이번 주 편 대결: 편마다 사람(이번 주 최고 기록 하나씩)의 평균 (3명 이상인 편만) */
export async function weekTeams(game: DailyGame, now = new Date()): Promise<TeamRow[]> {
  const low = DAILY[game].lowerBetter;
  const teamSql =
    game === "booksent"
      ? "SELECT visitor_hash, type_key AS team FROM type_test_results WHERE test_key = 'book-sentence'"
      : "SELECT visitor_hash, team FROM game_teams WHERE game = $1";
  const rows = await query<{ team: string; best: number }>(
    `WITH b AS (SELECT visitor_hash, ${low ? "min" : "max"}(score)::int AS best FROM game_plays WHERE game = $1 AND day >= $2::date GROUP BY visitor_hash),
          t AS (${teamSql})
     SELECT t.team, b.best FROM b JOIN t ON t.visitor_hash = b.visitor_hash`,
    [game, kstWeekDay(now)],
  );
  const people = rows.map((r) => ({ team: game === "booksent" ? (bookTeamName(r.team) ?? r.team) : r.team, best: Number(r.best) }));
  return teamTable(game, people);
}

export type DailyStatus = {
  game: DailyGame;
  /** 🔥 연속 기록 (오늘 했으면 오늘까지) */
  streak: number;
  /** 오늘 내 기록과 오늘 순위 (안 했으면 null) */
  today: { score: number; rank: number; total: number; top: number } | null;
  /** 오늘 한 사람 수 */
  totalToday: number;
  /** 사람이 적은 날: 순위보다 상위 %·어제의 나를 앞에 */
  lowPop: boolean;
  yesterday: number | null;
  /** 어제의 나보다 좋아진 만큼 (책·애니: 개수, K리그: 초) */
  delta: number | null;
  team: string | null;
  teams: TeamRow[];
};

export async function dailyStatus(game: DailyGame, visitor: string | null, now = new Date()): Promise<DailyStatus> {
  const day = kstDay(now);
  const low = DAILY[game].lowerBetter;
  const todayRows = await query<{ visitor_hash: string; score: number }>("SELECT visitor_hash, score FROM game_plays WHERE game = $1 AND day = $2 ORDER BY created_at", [game, day]);
  // 하루 게임은 한 사람 하루 한 줄이지만, 혹시 여러 줄이면 첫 판만
  const firsts = new Map<string, number>();
  for (const r of todayRows) if (!firsts.has(r.visitor_hash)) firsts.set(r.visitor_hash, Number(r.score));
  const hashes = [...firsts.keys()];
  const scores = [...firsts.values()];
  const ranks = competitionRanks(scores, low);
  const totalToday = hashes.length;
  let today: DailyStatus["today"] = null;
  let streak = 0;
  let yesterday: number | null = null;
  let team: string | null = null;
  if (visitor) {
    const i = hashes.indexOf(visitor);
    if (i >= 0) today = { score: scores[i]!, rank: ranks[i]!, total: totalToday, top: topPercent(ranks[i]!, totalToday) };
    const days = await query<{ day: string; score: number }>(
      "SELECT day::text AS day, score FROM game_plays WHERE game = $1 AND visitor_hash = $2 AND day >= $3::date ORDER BY day, created_at",
      [game, visitor, prevDay(day, 120)],
    );
    streak = streakOf(
      days.map((d) => d.day),
      day,
    );
    const y = days.find((d) => d.day === prevDay(day));
    yesterday = y ? Number(y.score) : null;
    team = await teamOf(game, visitor);
  }
  return {
    game,
    streak,
    today,
    totalToday,
    lowPop: totalToday < LOW_POP,
    yesterday,
    delta: today ? deltaVsYesterday(game, today.score, yesterday) : null,
    team,
    teams: await weekTeams(game, now).catch(() => []),
  };
}

/** 🔥 닉네임별 연속 기록 (방 배지). 키: identityKey(닉네임) */
export async function dailyStreaksByNick(game: DailyGame, keys: readonly string[], now = new Date()): Promise<Record<string, number>> {
  if (!keys.length) return {};
  const day = kstDay(now);
  const rows = await query<{ nickname: string; day: string }>(
    "SELECT DISTINCT nickname, day::text AS day FROM game_plays WHERE game = $1 AND nickname IS NOT NULL AND day >= $2::date",
    [game, prevDay(day, 120)],
  );
  const want = new Set(keys);
  const by = new Map<string, string[]>();
  for (const r of rows) {
    const k = identityKey(r.nickname);
    if (!want.has(k)) continue;
    by.set(k, [...(by.get(k) ?? []), r.day]);
  }
  const out: Record<string, number> = {};
  for (const [k, ds] of by) out[k] = streakOf(ds, day);
  return out;
}

// ───────── 🔔 알림 켜기 ─────────

/** on 이 없으면 지금 켜져 있는지만. 켤 때는 이 브라우저의 방문자(쿠키 해시)와 잇는다 */
export async function setDailyPush(endpoint: string, token: string, game: DailyGame, visitor: string, on?: boolean): Promise<boolean> {
  const subId = await subscriptionIdFor(endpoint, token);
  if (on === true) {
    await query(
      `INSERT INTO game_push_subs (subscription_id, game, visitor_hash) VALUES ($1, $2, $3)
       ON CONFLICT (subscription_id, game) DO UPDATE SET visitor_hash = EXCLUDED.visitor_hash`,
      [subId, game, visitor],
    );
    return true;
  }
  if (on === false) {
    await query("DELETE FROM game_push_subs WHERE subscription_id = $1 AND game = $2", [subId, game]);
    return false;
  }
  const [r] = await query<{ n: number }>("SELECT count(*)::int AS n FROM game_push_subs WHERE subscription_id = $1 AND game = $2", [subId, game]);
  return Number(r?.n ?? 0) > 0;
}

// ───────── 📊 관리자: 하루 게임 재방문 ─────────

export type DailyRetentionRow = {
  game: DailyGame;
  players: number;
  playersNext: number | null;
  players7: number | null;
  others: number;
  othersNext: number | null;
  others7: number | null;
  streak2: number;
  pushOn: number;
};

/**
 * 게임을 한 사람 vs 그 방에 왔지만 안 한 사람: 다음 날 다시 온 비율, 7일 안에 다시 온 비율 (사이트 어디든 page_views).
 * 사람마다 기간 안 첫날 하나로 센다. 7일 비율은 7일이 지난 날까지만.
 */
export async function dailyRetention(days = 14, now = new Date()): Promise<DailyRetentionRow[]> {
  const to = kstDay(now);
  const from = prevDay(to, days - 1);
  const out: DailyRetentionRow[] = [];
  for (const game of Object.keys(DAILY) as DailyGame[]) {
    const room = DAILY[game].room;
    const [r] = await query<{
      players: number;
      p_base1: number;
      p_next: number;
      p_base7: number;
      p_7: number;
      others: number;
      o_base1: number;
      o_next: number;
      o_base7: number;
      o_7: number;
    }>(
      `WITH p AS (SELECT visitor_hash, min(day) AS d FROM game_plays WHERE game = $1 AND day BETWEEN $3::date AND $4::date GROUP BY visitor_hash),
            o AS (SELECT visitor_hash, min(day) AS d FROM page_views WHERE category_slug = $2 AND day BETWEEN $3::date AND $4::date
                   AND visitor_hash NOT IN (SELECT visitor_hash FROM p) GROUP BY visitor_hash),
            pr AS (SELECT p.d,
                     EXISTS (SELECT 1 FROM page_views v WHERE v.visitor_hash = p.visitor_hash AND v.day = p.d + 1) AS n1,
                     EXISTS (SELECT 1 FROM page_views v WHERE v.visitor_hash = p.visitor_hash AND v.day BETWEEN p.d + 1 AND p.d + 7) AS n7 FROM p),
            orr AS (SELECT o.d,
                     EXISTS (SELECT 1 FROM page_views v WHERE v.visitor_hash = o.visitor_hash AND v.day = o.d + 1) AS n1,
                     EXISTS (SELECT 1 FROM page_views v WHERE v.visitor_hash = o.visitor_hash AND v.day BETWEEN o.d + 1 AND o.d + 7) AS n7 FROM o)
       SELECT (SELECT count(*) FROM pr)::int AS players,
              (SELECT count(*) FROM pr WHERE d < $4::date)::int AS p_base1, (SELECT count(*) FROM pr WHERE d < $4::date AND n1)::int AS p_next,
              (SELECT count(*) FROM pr WHERE d <= $4::date - 7)::int AS p_base7, (SELECT count(*) FROM pr WHERE d <= $4::date - 7 AND n7)::int AS p_7,
              (SELECT count(*) FROM orr)::int AS others,
              (SELECT count(*) FROM orr WHERE d < $4::date)::int AS o_base1, (SELECT count(*) FROM orr WHERE d < $4::date AND n1)::int AS o_next,
              (SELECT count(*) FROM orr WHERE d <= $4::date - 7)::int AS o_base7, (SELECT count(*) FROM orr WHERE d <= $4::date - 7 AND n7)::int AS o_7`,
      [game, room, from, to],
    );
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
    const streakRows = await query<{ visitor_hash: string; day: string }>("SELECT DISTINCT visitor_hash, day::text AS day FROM game_plays WHERE game = $1 AND day >= $2::date", [game, prevDay(to, 120)]);
    const byV = new Map<string, string[]>();
    for (const s of streakRows) byV.set(s.visitor_hash, [...(byV.get(s.visitor_hash) ?? []), s.day]);
    const streak2 = [...byV.values()].filter((ds) => streakOf(ds, to) >= 2).length;
    const [push] = await query<{ n: number }>("SELECT count(*)::int AS n FROM game_push_subs WHERE game = $1", [game]);
    out.push({
      game,
      players: Number(r?.players ?? 0),
      playersNext: pct(Number(r?.p_next ?? 0), Number(r?.p_base1 ?? 0)),
      players7: pct(Number(r?.p_7 ?? 0), Number(r?.p_base7 ?? 0)),
      others: Number(r?.others ?? 0),
      othersNext: pct(Number(r?.o_next ?? 0), Number(r?.o_base1 ?? 0)),
      others7: pct(Number(r?.o_7 ?? 0), Number(r?.o_base7 ?? 0)),
      streak2,
      pushOn: Number(push?.n ?? 0),
    });
  }
  return out;
}
