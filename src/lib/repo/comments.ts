import { tokenOk } from "./images";
import { aiAbuse, aiImageAbuse, heuristicAbuse, hideParams, maskPersonalInfo } from "../abuse";
import { query, tx } from "../db";
import { blinded, HttpError, notFound } from "../errors";
import { extractMentions, resolveMentions } from "../mentions";
import { investProblem } from "../investRooms";
import { roomAbuseOpts, roomHeuristicAbuse } from "../roomModeration";
import { heuristicSpam, shouldSuppress } from "../moderation";
import { hashPin } from "../password";
import { hit } from "../rate-limit";
import type { Comment } from "../types";
import { assertPin } from "./pin-guard";
import { ownerAlertAfter } from "./ownerAlert";

/** 글이 있는 방 slug (없으면 null) */
async function roomOfPost(postId: string): Promise<string | null> {
  const [r] = await query<{ slug: string }>("SELECT c.slug FROM posts p JOIN categories c ON c.id = p.category_id WHERE p.id = $1", [postId]);
  return r?.slug ?? null;
}

/** 투자방 규칙 (10/24): 외부 채팅방 링크·리딩방 모집·전화번호는 댓글로도 못 올린다. 글이 있는 방 slug 를 돌려준다 */
async function assertInvestOk(postId: string, body: string): Promise<string | null> {
  const slug = await roomOfPost(postId);
  const problem = investProblem(slug, body);
  if (problem) throw new HttpError(400, "invest_rule", problem);
  return slug;
}

/** 같은 망에서 한 댓글로 보내는 답글·멘션 알림 (시간당) */
export const TARGET_LIMIT = 5;

// AI 자동 운영이 가린 댓글은 자리는 남기고 본문을 내보내지 않는다 (Sprint 37)
const COLS = `id, post_id, nickname, CASE WHEN ai_hidden_reason IS NULL THEN body ELSE '' END AS body, is_ai_curated, created_at,
  parent_id::text AS parent_id, mentions::text[] AS mentions, ai_hidden_reason AS hidden_reason,
  CASE WHEN ai_hidden_reason IS NULL THEN image_id::text END AS image_id`;

export async function listComments(postId: string): Promise<Comment[]> {
  if (!/^\d{1,18}$/.test(postId)) return [];
  // 블라인드·임시조치된 글의 댓글은 내보내지 않는다 (글 API 와 같게, Sprint 33)
  return query<Comment>(
    `SELECT * FROM (SELECT ${COLS}, (SELECT count(*)::int FROM comment_likes l WHERE l.comment_id = comments.id AND l.by_name IS NULL) AS likes,
            (SELECT coalesce(array_agg(l.by_name ORDER BY l.created_at), '{}') FROM comment_likes l WHERE l.comment_id = comments.id AND l.by_name IS NOT NULL) AS liked_by
       FROM comments WHERE post_id = $1 AND NOT EXISTS (SELECT 1 FROM posts WHERE id = $1 AND is_blinded)
      -- 최근 1000개 (수다방처럼 긴 대화는 최신이 보여야 한다, Sprint 84)
      ORDER BY id DESC LIMIT 1000) t ORDER BY id`,
    [postId],
  );
}

/**
 * INSERT 트리거가 pg_notify('comment_events') 로 실시간 구독자에게 전파한다.
 * parentId 는 같은 글의 댓글이어야 한다. 본문의 @닉네임은 이 글의 댓글 번호로 바꿔 mentions 에 남긴다 (Sprint 30).
 */
export async function createComment(
  postId: string,
  input: { nickname: string; pin: string; body: string; fingerprint?: string; net?: string; parentId?: string; image?: { id: string; token: string } },
): Promise<Comment> {
  if (!/^\d{1,18}$/.test(postId)) throw notFound();
  const slug = await assertInvestOk(postId, input.body);
  // 휴대전화·이메일·주민등록번호는 지운 판으로 저장 (Sprint 37)
  // 광고·홍보 댓글 (Sprint 83): 글과 같은 규칙으로, 연락처를 지우기 전 원문으로 판단한다
  const spam = heuristicSpam("", input.body);
  input = { ...input, body: maskPersonalInfo(input.body).text };
  const pwHash = await hashPin(input.pin);
  const comment = await tx(async (client) => {
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
    // 한 댓글(한 사람)에게 알림을 몰아 보내지 못하게: 같은 망에서 같은 댓글로 가는 답글·멘션은 시간당 TARGET_LIMIT 개까지 (Sprint 33)
    const targetKey = (id: string) => `comment:target:${input.net ?? input.fingerprint ?? "-"}:${id}`;
    if (parentId && !(await hit(targetKey(parentId), TARGET_LIMIT, 3600_000))) {
      throw new HttpError(429, "rate_limited", "이 댓글에 답글을 너무 많이 달았어요. 잠시 후 다시 시도해주세요.");
    }
    let mentions: string[] = [];
    if (input.body.includes("@")) {
      const { rows: thread } = await client.query<{ id: string; nickname: string; mine: boolean; ai: boolean; author: string | null }>(
        `SELECT id::text, nickname, ($2::text IS NOT NULL AND author_fingerprint = $2::text) AS mine, is_ai_curated AS ai, author_fingerprint AS author
           FROM comments WHERE post_id = $1 ORDER BY id DESC LIMIT 1000`,
        [postId, input.fingerprint ?? null],
      );
      const resolved = resolveMentions(extractMentions(input.body, thread.map((c) => c.nickname)), thread, parentId);
      // 한도를 넘은 대상은 멘션에서만 뺀다 (댓글은 올라감)
      for (const id of resolved) if (await hit(targetKey(id), TARGET_LIMIT, 3600_000)) mentions.push(id);
    }
    // 분명한 욕설·혐오·개인정보는 처음부터 가려진 채 올라간다 (AI 자동 운영, Sprint 37)
    const abuse =
      heuristicAbuse(input.body) ??
      roomHeuristicAbuse(slug, input.body) ??
      (shouldSuppress(spam) ? { category: "spam" as const, evidence: spam.reasons.join(", "), model: spam.model } : null);
    // 사진 (Sprint 90): 방금 올린, 아직 어디에도 안 붙은 사진만 — 업로드 토큰으로 확인
    let imageId: string | null = null;
    if (input.image) {
      const img = await client.query<{ id: string }>(
        "SELECT id FROM post_images WHERE id = $1 AND post_id IS NULL AND comment_id IS NULL FOR UPDATE",
        [input.image.id],
      );
      if (!img.rows[0] || !tokenOk(input.image.id, input.image.token)) throw new HttpError(400, "image_expired", "사진을 찾을 수 없어요. 다시 올려 주세요.");
      imageId = input.image.id;
    }
    const { rows } = await client.query<Comment>(
      `INSERT INTO comments (post_id, nickname, pw_hash, body, author_fingerprint, parent_id, mentions, image_id,
                             ai_hidden_reason, ai_hidden_note, ai_hidden_model, ai_hidden_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::bigint[], $8::uuid, $9::text, $10, $11, CASE WHEN $9::text IS NOT NULL THEN now() END) RETURNING ${COLS}`,
      [postId, input.nickname, pwHash, input.body, input.fingerprint ?? null, parentId, mentions, imageId, ...hideParams(abuse)],
    );
    if (imageId)
      await client.query("UPDATE post_images SET post_id = $2, comment_id = $3, attached_at = now() WHERE id = $1", [imageId, postId, rows[0]!.id]);
    return rows[0]!;
  });
  // 🔔 사람이 쓴 댓글이면 운영자 기기로 바로 (기다리지 않음, 10/25). 운영 초안·환영 답글은 지문이 없어 빠진다
  ownerAlertAfter({ kind: "comment", nickname: input.nickname, fingerprint: input.fingerprint }, { kind: "comment", postId, commentId: String(comment.id), body: input.body });
  return comment;
}

export async function deleteComment(id: string, fp: string, pin: string): Promise<void> {
  if (!/^\d{1,18}$/.test(id)) throw notFound("댓글");
  const rows = await query<{ pw_hash: string }>("SELECT pw_hash FROM comments WHERE id = $1", [id]);
  if (!rows[0]) throw notFound("댓글");
  await assertPin(`comment:${id}`, fp, pin, rows[0].pw_hash);
  await query("DELETE FROM comments WHERE id = $1", [id]);
}

/** 댓글 본문 고치기 (10/23) — 지울 때와 같은 비번 확인. 개인정보는 등록 때처럼 가린다 */
export async function updateComment(id: string, fp: string, pin: string, body: string): Promise<void> {
  if (!/^\d{1,18}$/.test(id)) throw notFound("댓글");
  const rows = await query<{ pw_hash: string; post_id: string }>("SELECT pw_hash, post_id::text FROM comments WHERE id = $1", [id]);
  if (!rows[0]) throw notFound("댓글");
  await assertPin(`comment:${id}`, fp, pin, rows[0].pw_hash);
  await assertInvestOk(rows[0].post_id, body);
  await query("UPDATE comments SET body = $2 WHERE id = $1", [id, maskPersonalInfo(body).text]);
}

/**
 * 등록 직후 비동기로: Claude 가 문맥으로 판단해 확신이 높으면 가린다 (API 키가 없으면 규칙 판단만).
 * 운영자가 풀어 준 댓글, 이미 가려진 댓글은 건드리지 않는다. 가려지면 트리거가 실시간으로 알린다.
 */
export async function aiModerateComment(id: string): Promise<boolean> {
  if (!/^\d{1,18}$/.test(id)) return false;
  const rows = await query<{ body: string; image_id: string | null; slug: string }>(
    `SELECT c.body, c.image_id::text, cat.slug FROM comments c JOIN posts p ON p.id = c.post_id JOIN categories cat ON cat.id = p.category_id
      WHERE c.id = $1 AND c.ai_hidden_at IS NULL AND NOT c.ai_hide_released AND NOT c.is_ai_curated`,
    [id],
  );
  if (!rows[0]) return false;
  // 사진이 있으면 사진도 본다 (Sprint 90). 투자방은 리딩방·수익 보장 홍보도, 식단방은 극단적 다이어트 조장도 (10/24)
  const verdict =
    roomHeuristicAbuse(rows[0].slug, rows[0].body) ??
    (await aiAbuse(rows[0].body, roomAbuseOpts(rows[0].slug))) ??
    (rows[0].image_id ? await aiImageAbuse(rows[0].image_id) : null);
  if (!verdict) return false;
  const res = await query<{ id: string }>(
    `UPDATE comments SET ai_hidden_reason = $2, ai_hidden_note = $3, ai_hidden_model = $4, ai_hidden_at = now()
      WHERE id = $1 AND ai_hidden_at IS NULL AND NOT ai_hide_released RETURNING id`,
    [id, ...hideParams(verdict)],
  );
  return res.length > 0;
}
