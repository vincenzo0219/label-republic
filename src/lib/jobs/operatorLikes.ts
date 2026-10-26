import { AI_AUTHOR, LEGACY_AI_AUTHORS } from "../aiMark";
import { query } from "../db";
import { guardJob } from "./guard";

/** 모든 방에서 노방장 이름으로 (10/26 운영 이름 통일 — 예전엔 책방만 돈키호테) */
export const OPERATOR_LIKE_NAME = AI_AUTHOR;

/**
 * 👍 운영 계정 공감 (Sprint 79). 사람이 남긴 댓글에 1분쯤 뒤 운영 계정 이름으로 공감 하나.
 * 이름을 밝혀 따로 보여 주고 사람 공감 수에는 섞지 않는다. AI·운영 계정 댓글, 가려진 댓글, 하루 지난 댓글은 건너뛴다.
 */
export async function runOperatorLikes(now = new Date()): Promise<number> {
  const rows = await query<{ id: string }>(
    `INSERT INTO comment_likes (comment_id, visitor_hash, by_name, created_at)
     SELECT c.id, 'op:' || $3::text, $3::text, $1::timestamptz
       FROM comments c JOIN posts p ON p.id = c.post_id
      WHERE c.created_at <= $1::timestamptz - interval '1 minute' AND c.created_at > $1::timestamptz - interval '1 day'
        AND NOT c.is_ai_curated AND c.author_fingerprint IS NOT NULL AND c.ai_hidden_at IS NULL AND NOT p.is_blinded
        AND c.nickname <> ALL($2::text[])
        AND NOT EXISTS (SELECT 1 FROM comment_likes l WHERE l.comment_id = c.id AND l.by_name IS NOT NULL)
     ON CONFLICT DO NOTHING
     RETURNING comment_id::text AS id`,
    [now.toISOString(), [OPERATOR_LIKE_NAME, ...LEGACY_AI_AUTHORS], OPERATOR_LIKE_NAME],
  );
  return rows.length;
}

export function startOperatorLikesScheduler(intervalMs = 60_000): () => void {
  const tick = guardJob("operator-likes", runOperatorLikes);
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
