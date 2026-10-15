import { query } from "../db";
import type { DailyKind, DailyStats, DailyToday } from "../daily";

/** 답 저장 (Sprint 66). 같은 날 같은 문제는 처음 답만 남긴다. */
export async function saveDailyAnswer(day: string, visitorHash: string, kind: DailyKind, correct: boolean): Promise<void> {
  await query("INSERT INTO daily_answers (day, visitor_hash, kind, correct) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING", [day, visitorHash, kind, correct]);
}

/** 그날 문제별 참가자 수와 정답률 */
export async function dailyStats(day: string): Promise<DailyToday> {
  const rows = await query<{ kind: DailyKind; n: number; rate: number | null }>(
    "SELECT kind, count(*)::int AS n, avg(correct::int)::float AS rate FROM daily_answers WHERE day = $1 GROUP BY kind",
    [day],
  );
  const of = (k: DailyKind): DailyStats => {
    const r = rows.find((x) => x.kind === k);
    return { participants: r?.n ?? 0, rate: r?.rate ?? null };
  };
  return { day, line: of("line"), ear: of("ear") };
}

/** 관리자: 기간 안에 오늘의 문제를 푼 고유 방문자와, 그중 2일 이상 푼 사람 */
export async function dailyPlayers(from: string, to: string): Promise<{ players: number; repeat: number }> {
  const rows = await query<{ players: number; repeat: number }>(
    `SELECT count(*)::int AS players, count(*) FILTER (WHERE days >= 2)::int AS repeat
       FROM (SELECT visitor_hash, count(DISTINCT day) AS days FROM daily_answers WHERE day BETWEEN $1::date AND $2::date GROUP BY visitor_hash) t`,
    [from, to],
  );
  return rows[0]!;
}
