/** ⚖️ AI 토론 사람 투표 (Sprint 74). AI 쪽 숫자는 그날 페르소나 의견 댓글의 [편] 머리말로 센다. */
import { debateTopic } from "../debate";
import { query } from "../db";
import { notFound } from "../errors";

export type DebateSide = "A" | "B";
export type DebateTally = { a: string; b: string; human: { A: number; B: number }; ai: { A: number; B: number } };

async function topicOf(postId: string): Promise<[string, string]> {
  if (!/^\d{1,18}$/.test(postId)) throw notFound();
  const [row] = await query<{ seed_key: string }>("SELECT seed_key FROM posts WHERE id = $1 AND seed_key LIKE 'debate:%'", [postId]);
  const day = row?.seed_key.slice("debate:".length);
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw notFound("토론");
  return debateTopic(day);
}

export async function isDebatePost(postId: string): Promise<boolean> {
  return topicOf(postId).then(() => true, () => false);
}

export async function debateTally(postId: string): Promise<DebateTally> {
  const [a, b] = await topicOf(postId);
  const [h] = await query<{ a: number; b: number }>(
    "SELECT count(*) FILTER (WHERE side = 'A')::int AS a, count(*) FILTER (WHERE side = 'B')::int AS b FROM debate_votes WHERE post_id = $1",
    [postId],
  );
  const [ai] = await query<{ a: number; b: number }>(
    `SELECT count(*) FILTER (WHERE body LIKE $2)::int AS a, count(*) FILTER (WHERE body LIKE $3)::int AS b
       FROM comments WHERE post_id = $1 AND parent_id IS NULL AND is_ai_curated`,
    [postId, `[${a}]%`, `[${b}]%`],
  );
  return { a, b, human: { A: h!.a, B: h!.b }, ai: { A: ai!.a, B: ai!.b } };
}

export async function voteDebate(postId: string, visitorHash: string, side: DebateSide): Promise<DebateTally> {
  await topicOf(postId);
  await query(
    `INSERT INTO debate_votes (post_id, visitor_hash, side) VALUES ($1, $2, $3)
     ON CONFLICT (post_id, visitor_hash) DO UPDATE SET side = EXCLUDED.side`,
    [postId, visitorHash, side],
  );
  return debateTally(postId);
}
