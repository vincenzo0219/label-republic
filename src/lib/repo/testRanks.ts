import { query } from "../db";
import { teamOf, typeLabel, typeOf } from "../peers";
import { OPERATOR_NICKS } from "./metrics";

export type Ranking = { total: number; teams: { name: string; n: number }[]; types: { label: string; n: number }[] };

const count = (xs: (string | undefined)[]) => {
  const m = new Map<string, number>();
  for (const x of xs) if (x) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"));
};

/** 결과 글의 사람 댓글(맨 위 댓글만)을 until 전까지 세어 팀·타입별로 */
export async function testRanking(postId: string, until: Date): Promise<Ranking> {
  const rows = await query<{ body: string }>(
    `SELECT body FROM comments
      WHERE post_id = $1 AND parent_id IS NULL AND NOT is_ai_curated AND ai_hidden_at IS NULL
        AND author_fingerprint IS NOT NULL AND nickname <> ALL($2::text[]) AND created_at < $3`,
    [postId, OPERATOR_NICKS, until.toISOString()],
  );
  return {
    total: rows.length,
    teams: count(rows.map((r) => teamOf(r.body))).map(([name, n]) => ({ name, n })),
    types: count(rows.map((r) => typeOf(r.body))).map(([t, n]) => ({ label: typeLabel(t), n })),
  };
}
