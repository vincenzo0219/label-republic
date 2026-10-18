import { BOOK_ROOM_SLUG } from "../books";
import { query } from "../db";
import { reportError } from "../error-tracking";

/** 책방은 돈키호테, 나머지 방은 노방장 이름으로 */
export const OPERATOR_NAMES = { [BOOK_ROOM_SLUG]: "돈키호테", default: "노방장" } as const;

/**
 * 👍 운영 계정 공감 (Sprint 79). 사람이 남긴 댓글에 1분쯤 뒤 운영 계정 이름으로 공감 하나.
 * 이름을 밝혀 따로 보여 주고 사람 공감 수에는 섞지 않는다. AI·운영 계정 댓글, 가려진 댓글, 하루 지난 댓글은 건너뛴다.
 */
export async function runOperatorLikes(now = new Date()): Promise<number> {
  const rows = await query<{ id: string }>(
    `INSERT INTO comment_likes (comment_id, visitor_hash, by_name, created_at)
     SELECT c.id, 'op:' || CASE WHEN cat.slug = $3 THEN $4 ELSE $5 END, CASE WHEN cat.slug = $3 THEN $4 ELSE $5 END, $1::timestamptz
       FROM comments c JOIN posts p ON p.id = c.post_id JOIN categories cat ON cat.id = p.category_id
      WHERE c.created_at <= $1::timestamptz - interval '1 minute' AND c.created_at > $1::timestamptz - interval '1 day'
        AND NOT c.is_ai_curated AND c.author_fingerprint IS NOT NULL AND c.ai_hidden_at IS NULL AND NOT p.is_blinded
        AND c.nickname <> ALL($2::text[])
        AND NOT EXISTS (SELECT 1 FROM comment_likes l WHERE l.comment_id = c.id AND l.by_name IS NOT NULL)
     ON CONFLICT DO NOTHING
     RETURNING comment_id::text AS id`,
    [now.toISOString(), [OPERATOR_NAMES[BOOK_ROOM_SLUG], OPERATOR_NAMES.default], BOOK_ROOM_SLUG, OPERATOR_NAMES[BOOK_ROOM_SLUG], OPERATOR_NAMES.default],
  );
  return rows.length;
}

export function startOperatorLikesScheduler(intervalMs = 60_000): () => void {
  const tick = () =>
    runOperatorLikes().catch((err) => {
      console.error("[operator-likes] failed:", (err as Error).message);
      reportError(err, { kind: "job", where: "operator-likes" });
    });
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
