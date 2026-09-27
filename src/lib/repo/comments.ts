import { query, tx } from "../db";
import { blinded, notFound } from "../errors";
import { hashPin } from "../password";
import type { Comment } from "../types";
import { assertPin } from "./pin-guard";

const COLS = "id, post_id, nickname, body, is_ai_curated, created_at";

export async function listComments(postId: string): Promise<Comment[]> {
  if (!/^\d{1,18}$/.test(postId)) return [];
  return query<Comment>(`SELECT ${COLS} FROM comments WHERE post_id = $1 ORDER BY id LIMIT 1000`, [postId]);
}

/** INSERT 트리거가 pg_notify('comment_events') 로 실시간 구독자에게 전파한다. */
export async function createComment(
  postId: string,
  input: { nickname: string; pin: string; body: string; fingerprint?: string },
): Promise<Comment> {
  if (!/^\d{1,18}$/.test(postId)) throw notFound();
  const pwHash = await hashPin(input.pin);
  return tx(async (client) => {
    const post = await client.query<{ is_blinded: boolean }>("SELECT is_blinded FROM posts WHERE id = $1 FOR SHARE", [postId]);
    if (!post.rows[0]) throw notFound();
    if (post.rows[0].is_blinded) throw blinded();
    const { rows } = await client.query<Comment>(
      `INSERT INTO comments (post_id, nickname, pw_hash, body, author_fingerprint) VALUES ($1, $2, $3, $4, $5) RETURNING ${COLS}`,
      [postId, input.nickname, pwHash, input.body, input.fingerprint ?? null],
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
