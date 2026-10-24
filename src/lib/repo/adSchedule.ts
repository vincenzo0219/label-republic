import { query } from "../db";
import type { SchedulePost } from "../adSchedule";

/** 🎫 이번 주 일정: 이 방의 최근 30일 [행사]·[혜택] 글 (최신순, posts_category_created_idx) */
export async function recentEventPosts(categoryId: number, limit = 30): Promise<SchedulePost[]> {
  return query<SchedulePost>(
    `SELECT p.id::text, p.title, left(p.body, 4000) AS body, p.created_at
       FROM posts p
      WHERE p.category_id = $1 AND NOT p.is_blinded AND NOT p.is_suppressed
        AND p.created_at > now() - interval '30 days'
        AND (p.title LIKE '[행사]%' OR p.title LIKE '[혜택]%')
        AND (p.seed_key IS NULL OR p.seed_key NOT LIKE 'roomchat:%')
      ORDER BY p.created_at DESC
      LIMIT $2`,
    [categoryId, limit],
  );
}
