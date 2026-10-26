import { query } from "../db";
import type { CalendarPost } from "../roomCalendar";

/**
 * 📅 달력 구독: 이 방들의 [행사]·[혜택] 글 (최근 180일, 최신순). 숨긴 방·정보만 보여 주는 방(info_only)은 뺀다.
 * 행사 글은 몇 달 앞 일정을 미리 올리기도 해서 홈(30일)보다 길게 본다. 지난 일정은 src/lib/roomCalendar.ts 에서 거른다.
 */
export async function calendarPosts(slugs: readonly string[]): Promise<CalendarPost[]> {
  if (!slugs.length) return [];
  return query<CalendarPost>(
    `SELECT p.id::text, p.title, left(p.body, 4000) AS body, p.created_at, c.slug AS room_slug, c.name AS room_name
       FROM posts p JOIN categories c ON c.id = p.category_id
      WHERE c.slug = ANY($1::text[]) AND NOT c.is_hidden AND NOT c.info_only
        AND NOT p.is_blinded AND NOT p.is_suppressed
        AND p.created_at > now() - interval '180 days'
        AND (p.title LIKE '[행사]%' OR p.title LIKE '[혜택]%')
        AND (p.seed_key IS NULL OR p.seed_key NOT LIKE 'roomchat:%')
      ORDER BY p.created_at DESC
      LIMIT 300`,
    [[...slugs]],
  );
}

/** 오늘(KST) 가져간 횟수 +1 */
export async function countCalendarFetch(): Promise<void> {
  await query(
    `INSERT INTO calendar_fetches (day, fetches) VALUES ((now() AT TIME ZONE 'Asia/Seoul')::date, 1)
     ON CONFLICT (day) DO UPDATE SET fetches = calendar_fetches.fetches + 1`,
  );
}

/** /admin 📅 달력 구독: 오늘·최근 7일·최근 30일 가져간 횟수 */
export async function calendarFetchStats(): Promise<{ today: number; week: number; month: number }> {
  const [r] = await query<{ today: number; week: number; month: number }>(
    `WITH t AS (SELECT (now() AT TIME ZONE 'Asia/Seoul')::date AS d)
     SELECT coalesce(sum(fetches) FILTER (WHERE day = t.d), 0)::int AS today,
            coalesce(sum(fetches) FILTER (WHERE day > t.d - 7), 0)::int AS week,
            coalesce(sum(fetches) FILTER (WHERE day > t.d - 30), 0)::int AS month
       FROM calendar_fetches, t`,
  );
  return r ?? { today: 0, week: 0, month: 0 };
}
