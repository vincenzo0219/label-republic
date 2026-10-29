/**
 * 📊 퀴즈 리텐션 (10/29 대표님 "측정부터 진행후 3일후 판단"): 순위(🏆 이번 주)를 켜기 전 기준 숫자.
 * 사람은 방문자 쿠키 해시(visitor_hash) 하나로 센다. 퀴즈 답·오늘의 질문 투표·코스피 맞히기·방 조회(page_views)가 모두 같은 해시.
 * - 답한 사람: 그날 그 방 퀴즈 답 + 💌 오늘의 질문 투표 + 📈 코스피 맞히기(고른 한국 날짜)
 * - 방문: 그날 그 방 화면을 연 기록(page_views) 또는 답
 */
import { query } from "../db";
import { pct } from "../roomQuizzes";

/** 순위를 먼저 켜 볼 방 (전후 비교용) */
export const RETENTION_TEST_ROOMS = new Set(["애니-만화-덕후방", "드라마-덕후방", "커피-덕후방", "게임-덕후방", "주식"]);

export type RetentionDay = {
  day: string; visitors: number; answerers: number;
  /** 답한 사람 ÷ 방문자 (%) */
  rate: number;
  /** 이날 답한 사람 중 다음 날 같은 방에 다시 온 비율 (%). 다음 날이 아직 안 왔으면 null */
  nextDay: number | null; returned: number;
};
export type RetentionRoom = {
  room: string; test: boolean; days: RetentionDay[];
  /** 기간 합계: 답한 사람(중복 없이), 3일 이상 답한 사람, 그 비율, 다음 날 재방문(다음 날이 있는 날만) */
  answerers: number; regulars: number; regularRate: number; nextDay: number | null;
};

/** 기간(d)과 그 안의 답(ans: 방·한국 날짜·방문자). $1 = 지금, $2 = 일수 */
const WINDOW_ANS = `WITH d AS (SELECT generate_series(($1::timestamptz AT TIME ZONE 'Asia/Seoul')::date - ($2::int - 1), ($1::timestamptz AT TIME ZONE 'Asia/Seoul')::date, interval '1 day')::date AS day),
     ans AS (
       SELECT room, day, visitor_hash FROM quiz_answers WHERE day IN (SELECT day FROM d)
       UNION
       SELECT split_part(p.seed_key, ':', 2), split_part(p.seed_key, ':', 3)::date, dv.visitor_hash
         FROM debate_votes dv JOIN posts p ON p.id = dv.post_id
        WHERE p.seed_key LIKE 'roompoll:%' AND split_part(p.seed_key, ':', 3) ~ '^\\d{4}-\\d{2}-\\d{2}$'
          AND split_part(p.seed_key, ':', 3)::date IN (SELECT day FROM d)
       UNION
       SELECT room, (created_at AT TIME ZONE 'Asia/Seoul')::date, visitor_hash FROM kospi_picks
        WHERE (created_at AT TIME ZONE 'Asia/Seoul')::date IN (SELECT day FROM d)
     )`;

export async function quizRetention(days: number, now = new Date()): Promise<{ from: string; to: string; rooms: RetentionRoom[]; total: RetentionRoom }> {
  const n = Math.max(1, Math.min(31, days));
  const rows = await query<{ room: string; day: string; visitors: number; answerers: number; returned: number }>(
    `${WINDOW_ANS},
     vis AS (
       SELECT category_slug AS room, day, visitor_hash FROM page_views WHERE category_slug IS NOT NULL AND day IN (SELECT day FROM d)
       UNION SELECT room, day, visitor_hash FROM ans
     )
     SELECT a.room, a.day::text AS day,
            (SELECT count(*) FROM vis v WHERE v.room = a.room AND v.day = a.day)::int AS visitors,
            count(*)::int AS answerers,
            count(*) FILTER (WHERE EXISTS (SELECT 1 FROM vis v WHERE v.room = a.room AND v.day = a.day + 1 AND v.visitor_hash = a.visitor_hash))::int AS returned
       FROM ans a GROUP BY a.room, a.day ORDER BY a.room, a.day DESC`,
    [now.toISOString(), n],
  );
  const window = await query<{ room: string; answerers: number; regulars: number }>(
    `${WINDOW_ANS},
     per AS (SELECT room, visitor_hash, count(DISTINCT day) AS n FROM ans GROUP BY 1, 2)
     SELECT room, count(*)::int AS answerers, count(*) FILTER (WHERE n >= 3)::int AS regulars FROM per GROUP BY room`,
    [now.toISOString(), n],
  );
  const to = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  const from = new Date(Date.parse(to) - (n - 1) * 86400_000).toISOString().slice(0, 10);
  const w = new Map(window.map((r) => [r.room, r]));
  // 다음 날이 이미 지난 날만 모아서 재방문율
  const nextDayRate = (list: RetentionDay[]) => {
    const done = list.filter((x) => x.nextDay !== null);
    const a = done.reduce((s, x) => s + x.answerers, 0);
    return a ? pct(done.reduce((s, x) => s + x.returned, 0), a) : null;
  };
  const byRoom = new Map<string, RetentionDay[]>();
  for (const r of rows) {
    const list = byRoom.get(r.room) ?? [];
    list.push({
      day: r.day, visitors: r.visitors, answerers: r.answerers, rate: Math.min(100, pct(r.answerers, r.visitors)),
      returned: r.returned, nextDay: r.day >= to ? null : pct(r.returned, r.answerers),
    });
    byRoom.set(r.room, list);
  }
  const rooms: RetentionRoom[] = [...byRoom.entries()].map(([room, list]) => {
    const x = w.get(room) ?? { answerers: 0, regulars: 0 };
    return { room, test: RETENTION_TEST_ROOMS.has(room), days: list, answerers: x.answerers, regulars: x.regulars, regularRate: pct(x.regulars, x.answerers), nextDay: nextDayRate(list) };
  });
  rooms.sort((a, b) => Number(b.test) - Number(a.test) || b.answerers - a.answerers);
  // 전체: 방·사람 짝으로 합친다 (두 방에 답한 사람은 두 번)
  const dayMap = new Map<string, RetentionDay>();
  for (const r of rooms)
    for (const x of r.days) {
      const t = dayMap.get(x.day) ?? { day: x.day, visitors: 0, answerers: 0, rate: 0, returned: 0, nextDay: x.nextDay === null ? null : 0 };
      t.visitors += x.visitors; t.answerers += x.answerers; t.returned += x.returned;
      dayMap.set(x.day, t);
    }
  const totalDays = [...dayMap.values()].sort((a, b) => (a.day < b.day ? 1 : -1)).map((t) => ({
    ...t, rate: Math.min(100, pct(t.answerers, t.visitors)), nextDay: t.nextDay === null ? null : pct(t.returned, t.answerers),
  }));
  const ta = rooms.reduce((s, r) => s + r.answerers, 0);
  const tr = rooms.reduce((s, r) => s + r.regulars, 0);
  return { from, to, rooms, total: { room: "전체", test: false, days: totalDays, answerers: ta, regulars: tr, regularRate: pct(tr, ta), nextDay: nextDayRate(totalDays) } };
}
