/**
 * 👍 댓글 공감 (Sprint 78). 익명, 방문자 쿠키 해시당 한 번 (다시 누르면 취소).
 * 운영 계정 공감(Sprint 79)은 by_name 에 이름을 남기고 사람 공감 수와 따로 보여 준다.
 */
import { query } from "../db";
import { notFound } from "../errors";

export async function likeCounts(commentIds: string[]): Promise<Record<string, number>> {
  if (!commentIds.length) return {};
  const rows = await query<{ id: string; n: number }>(
    "SELECT comment_id::text AS id, count(*)::int AS n FROM comment_likes WHERE comment_id = ANY($1::bigint[]) AND by_name IS NULL GROUP BY comment_id",
    [commentIds],
  );
  return Object.fromEntries(rows.map((r) => [r.id, r.n]));
}

export async function toggleLike(commentId: string, visitorHash: string, on: boolean): Promise<number> {
  if (!/^\d{1,18}$/.test(commentId)) throw notFound();
  const [c] = await query<{ id: string }>(
    "SELECT c.id::text FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.id = $1 AND NOT p.is_blinded AND c.ai_hidden_at IS NULL",
    [commentId],
  );
  if (!c) throw notFound("댓글");
  if (on) await query("INSERT INTO comment_likes (comment_id, visitor_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING", [commentId, visitorHash]);
  else await query("DELETE FROM comment_likes WHERE comment_id = $1 AND visitor_hash = $2 AND by_name IS NULL", [commentId, visitorHash]);
  return (await likeCounts([commentId]))[commentId] ?? 0;
}
