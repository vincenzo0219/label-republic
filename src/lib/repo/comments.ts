import { query, tx } from "../db";
import { blinded, notFound } from "../errors";
import { extractMentions, resolveMentions } from "../mentions";
import { hashPin } from "../password";
import type { Comment } from "../types";
import { assertPin } from "./pin-guard";

const COLS = "id, post_id, nickname, body, is_ai_curated, created_at, parent_id::text AS parent_id, mentions::text[] AS mentions";

export async function listComments(postId: string): Promise<Comment[]> {
  if (!/^\d{1,18}$/.test(postId)) return [];
  return query<Comment>(`SELECT ${COLS} FROM comments WHERE post_id = $1 ORDER BY id LIMIT 1000`, [postId]);
}

/**
 * INSERT 트리거가 pg_notify('comment_events') 로 실시간 구독자에게 전파한다.
 * parentId 는 같은 글의 댓글이어야 한다. 본문의 @닉네임은 이 글의 댓글 번호로 바꿔 mentions 에 남긴다 (Sprint 30).
 */
export async function createComment(
  postId: string,
  input: { nickname: string; pin: string; body: string; fingerprint?: string; parentId?: string },
): Promise<Comment> {
  if (!/^\d{1,18}$/.test(postId)) throw notFound();
  const pwHash = await hashPin(input.pin);
  return tx(async (client) => {
    const post = await client.query<{ is_blinded: boolean }>("SELECT is_blinded FROM posts WHERE id = $1 FOR SHARE", [postId]);
    if (!post.rows[0]) throw notFound();
    if (post.rows[0].is_blinded) throw blinded();
    let parentId: string | null = null;
    if (input.parentId) {
      // 답할 댓글이 도중에 지워지지 않게 잠근다
      const p = await client.query<{ id: string }>("SELECT id::text FROM comments WHERE id = $1 AND post_id = $2 FOR SHARE", [input.parentId, postId]);
      if (!p.rows[0]) throw notFound("답글을 달 댓글");
      parentId = p.rows[0].id;
    }
    let mentions: string[] = [];
    if (input.body.includes("@")) {
      const { rows: thread } = await client.query<{ id: string; nickname: string; mine: boolean; ai: boolean }>(
        `SELECT id::text, nickname, ($2::text IS NOT NULL AND author_fingerprint = $2::text) AS mine, is_ai_curated AS ai
           FROM comments WHERE post_id = $1 ORDER BY id DESC LIMIT 1000`,
        [postId, input.fingerprint ?? null],
      );
      mentions = resolveMentions(extractMentions(input.body, thread.map((c) => c.nickname)), thread, parentId);
    }
    const { rows } = await client.query<Comment>(
      `INSERT INTO comments (post_id, nickname, pw_hash, body, author_fingerprint, parent_id, mentions)
       VALUES ($1, $2, $3, $4, $5, $6, $7::bigint[]) RETURNING ${COLS}`,
      [postId, input.nickname, pwHash, input.body, input.fingerprint ?? null, parentId, mentions],
    );
    return rows[0]!;
  });
}

export async function deleteComment(id: string, fp: string, pin: string): Promise<void> {
  if (!/^\d{1,18}$/.test(id)) throw notFound("댓글");
  const rows = await query<{ pw_hash: string }>("SELECT pw_hash FROM comments WHERE id = $1", [id]);
  if (!rows[0]) throw notFound("댓글");
  await assertPin(`comment:${id}`, fp, pin, rows[0].pw_hash);
  await query("DELETE FROM comments WHERE id = $1", [id]);
}
