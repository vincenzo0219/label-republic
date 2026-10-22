import { query } from "../db";
import { HttpError } from "../errors";
import { hashPin } from "../password";
import { assertPin } from "./pin-guard";

/**
 * 마이페이지 (10/22). 가입이 없으니 "내 글"은 이 브라우저가 기억한 번호 + 지금 접속(fingerprint)으로 쓴 글을 합친다.
 * 닉네임·비밀번호 바꾸기는 글·댓글마다 지금 비밀번호가 맞는 것만 바꾼다 (틀린 건 건너뛰고 대상별 대입 제한은 그대로).
 */
export const MAX_ME_IDS = 100;

export type MyPost = { id: string; title: string; nickname: string; created_at: string; comment_count: number; room: string; slug: string; fp: boolean };
export type MyComment = { id: string; post_id: string; post_title: string; body: string; nickname: string; created_at: string; fp: boolean };

export async function myActivity(postIds: string[], commentIds: string[], fp: string): Promise<{ posts: MyPost[]; comments: MyComment[] }> {
  const posts = await query<MyPost>(
    `SELECT p.id::text, p.title, p.nickname, p.created_at, p.comment_count, c.name AS room, c.slug, (p.author_fingerprint = $2) AS fp
       FROM posts p JOIN categories c ON c.id = p.category_id
      WHERE NOT p.is_blinded AND (p.seed_key IS NULL OR p.seed_key NOT LIKE 'roomchat:%')
        AND (p.id = ANY($1::bigint[]) OR (p.author_fingerprint = $2 AND p.created_at > now() - interval '30 days'))
      ORDER BY p.id DESC LIMIT $3`,
    [postIds, fp, MAX_ME_IDS],
  );
  const comments = await query<MyComment>(
    `SELECT m.id::text, m.post_id::text, p.title AS post_title, left(m.body, 80) AS body, m.nickname, m.created_at, (m.author_fingerprint = $2) AS fp
       FROM comments m JOIN posts p ON p.id = m.post_id
      WHERE NOT p.is_blinded AND m.ai_hidden_at IS NULL AND NOT m.is_ai_curated
        AND (m.id = ANY($1::bigint[]) OR (m.author_fingerprint = $2 AND m.created_at > now() - interval '30 days'))
      ORDER BY m.id DESC LIMIT $3`,
    [commentIds, fp, MAX_ME_IDS],
  );
  return { posts, comments };
}

type Target = { kind: "post" | "comment"; id: string; pw_hash: string };

async function targets(postIds: string[], commentIds: string[]): Promise<Target[]> {
  const [p, c] = await Promise.all([
    query<{ id: string; pw_hash: string }>("SELECT id::text, pw_hash FROM posts WHERE id = ANY($1::bigint[])", [postIds]),
    query<{ id: string; pw_hash: string }>("SELECT id::text, pw_hash FROM comments WHERE id = ANY($1::bigint[]) AND NOT is_ai_curated", [commentIds]),
  ]);
  return [...p.map((r) => ({ kind: "post" as const, ...r })), ...c.map((r) => ({ kind: "comment" as const, ...r }))];
}

/** 비밀번호가 맞는 글·댓글만 골라 낸다. 대입 제한에 걸리면 바로 멈춘다 */
async function owned(list: Target[], fp: string, pin: string): Promise<Target[]> {
  const ok: Target[] = [];
  for (const t of list) {
    try {
      await assertPin(`${t.kind}:${t.id}`, fp, pin, t.pw_hash);
      ok.push(t);
    } catch (err) {
      if ((err as HttpError).status === 429) throw err;
    }
  }
  return ok;
}

/** 지난 글·댓글 닉네임도 바꾸기 — 바꾼 개수 */
export async function renameMine(pin: string, nickname: string, postIds: string[], commentIds: string[], fp: string): Promise<{ posts: number; comments: number }> {
  const mine = await owned(await targets(postIds, commentIds), fp, pin);
  const p = mine.filter((t) => t.kind === "post").map((t) => t.id);
  const c = mine.filter((t) => t.kind === "comment").map((t) => t.id);
  if (p.length) await query("UPDATE posts SET nickname = $2 WHERE id = ANY($1::bigint[])", [p, nickname]);
  if (c.length) await query("UPDATE comments SET nickname = $2 WHERE id = ANY($1::bigint[])", [c, nickname]);
  return { posts: p.length, comments: c.length };
}

/** 비밀번호 바꾸기 — 지금 번호가 맞는 글·댓글을 새 번호로 */
export async function changeMyPin(oldPin: string, newPin: string, postIds: string[], commentIds: string[], fp: string): Promise<{ posts: number; comments: number }> {
  const mine = await owned(await targets(postIds, commentIds), fp, oldPin);
  const hash = await hashPin(newPin);
  const p = mine.filter((t) => t.kind === "post").map((t) => t.id);
  const c = mine.filter((t) => t.kind === "comment").map((t) => t.id);
  if (p.length) await query("UPDATE posts SET pw_hash = $2 WHERE id = ANY($1::bigint[])", [p, hash]);
  if (c.length) await query("UPDATE comments SET pw_hash = $2 WHERE id = ANY($1::bigint[])", [c, hash]);
  return { posts: p.length, comments: c.length };
}
