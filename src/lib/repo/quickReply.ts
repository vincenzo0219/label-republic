/**
 * 🙌 답장 버튼·첫 환영 배지 (10/29): 글이 사람 글인지, 보는 사람이 쓴 글인지, 관리자 숫자.
 */
import { query } from "../db";
import { OPERATOR_NICKS } from "./metrics";

/** 이 글이 사람이 쓴 글인지(운영 닉네임·AI·에이전트·운영 시드 글 제외)와 보는 사람이 쓴 글인지 */
export async function quickReplyContext(postId: string, viewerFp: string | null): Promise<{ human: boolean; mine: boolean; slug: string | null }> {
  if (!/^\d{1,18}$/.test(postId)) return { human: false, mine: false, slug: null };
  const [r] = await query<{ human: boolean; mine: boolean; slug: string }>(
    `SELECT (p.author_fingerprint IS NOT NULL AND NOT p.is_ai_curated AND p.seed_key IS NULL AND p.author_agent IS NULL AND p.nickname <> ALL($3::text[])) AS human,
            ($2::text IS NOT NULL AND p.author_fingerprint = $2::text) AS mine, c.slug
       FROM posts p JOIN categories c ON c.id = p.category_id WHERE p.id = $1`,
    [postId, viewerFp, OPERATOR_NICKS],
  );
  return r ? { human: r.human, mine: r.mine, slug: r.slug } : { human: false, mine: false, slug: null };
}

/**
 * 🙌 첫 환영: 방금 단 댓글이 "처음 온 사람(그 방 첫 사람 글)의 글에 사람이 단 첫 댓글"이면 표시한다.
 * 글쓴이 자신·운영 닉네임·AI 댓글은 세지 않는다. 표시했으면 true
 */
export async function markWelcome(client: { query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number | null }> }, commentId: string, fingerprint: string | null | undefined, nickname: string): Promise<boolean> {
  if (!fingerprint || OPERATOR_NICKS.includes(nickname.trim())) return false;
  const r = await client.query(
    `UPDATE comments c SET welcome = true
      WHERE c.id = $1 AND NOT c.is_ai_curated AND c.ai_hidden_reason IS NULL
        AND EXISTS (
          SELECT 1 FROM posts p WHERE p.id = c.post_id AND p.author_fingerprint IS NOT NULL AND p.author_fingerprint <> $2
             AND NOT p.is_ai_curated AND p.seed_key IS NULL AND p.author_agent IS NULL AND p.nickname <> ALL($3::text[])
             AND NOT EXISTS (SELECT 1 FROM posts q WHERE q.category_id = p.category_id AND q.author_fingerprint = p.author_fingerprint AND q.id < p.id))
        AND NOT EXISTS (
          SELECT 1 FROM comments o JOIN posts p2 ON p2.id = o.post_id
           WHERE o.post_id = c.post_id AND o.id < c.id AND o.author_fingerprint IS NOT NULL AND NOT o.is_ai_curated
             AND o.author_fingerprint IS DISTINCT FROM p2.author_fingerprint AND o.nickname <> ALL($3::text[]))`,
    [commentId, fingerprint, OPERATOR_NICKS],
  );
  return (r.rowCount ?? 0) > 0;
}

/** 관리자: 최근 7일 답장 버튼 댓글 수·첫 환영 수·환영러 수 */
export async function quickReplyStats(): Promise<{ chips: number; welcomes: number; welcomers: number }> {
  const [r] = await query<{ chips: number; welcomes: number; welcomers: number }>(
    `SELECT count(*) FILTER (WHERE via_chip)::int AS chips, count(*) FILTER (WHERE welcome)::int AS welcomes,
            count(DISTINCT nickname) FILTER (WHERE welcome)::int AS welcomers
       FROM comments WHERE created_at > now() - interval '7 days'`,
  );
  return r ?? { chips: 0, welcomes: 0, welcomers: 0 };
}
