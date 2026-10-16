import { query } from "../db";
import type { EarFunnel } from "../earTest";

/** 결과를 남기는 테스트 표 — 둘 다 visitor_hash·created_at·bragged_at 을 가진다 */
export type TestTable = "ear_test_results" | "hearing_test_results" | "first_line_test_results" | "typing_test_results" | "ai_test_results";

/** "점수 인증하기"를 누름 — 그 방문자의 마지막 결과에 시각을 남긴다. 결과가 없거나 이미 눌렀으면 false. */
export async function markBrag(table: TestTable, visitorHash: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE ${table} SET bragged_at = now()
      WHERE id = (SELECT max(id) FROM ${table} WHERE visitor_hash = $1) AND bragged_at IS NULL
      RETURNING id`,
    [visitorHash],
  );
  return rows.length > 0;
}

/**
 * 테스트 → 인증 버튼 → 인증 댓글 깔때기 (Sprint 60). from·to 는 KST 날짜(포함).
 * 인증 댓글은 글쓴이(덕후1호)·AI 댓글을 뺀다.
 */
export async function testFunnel(table: TestTable, bragPostId: string, from: string, to: string): Promise<EarFunnel> {
  const rows = await query<{ finished: number; clicks: number; comments: number }>(
    `WITH firsts AS (SELECT DISTINCT ON (visitor_hash) visitor_hash, created_at FROM ${table} ORDER BY visitor_hash, id),
          win AS (SELECT ($1::date)::timestamp AT TIME ZONE 'Asia/Seoul' AS lo, ($2::date + 1)::timestamp AT TIME ZONE 'Asia/Seoul' AS hi)
     SELECT (SELECT count(*)::int FROM firsts, win WHERE created_at >= lo AND created_at < hi) AS finished,
            (SELECT count(DISTINCT visitor_hash)::int FROM ${table}, win WHERE bragged_at >= lo AND bragged_at < hi) AS clicks,
            (SELECT count(*)::int FROM comments c, win WHERE c.post_id = $3 AND NOT c.is_ai_curated
                AND c.nickname IS DISTINCT FROM (SELECT nickname FROM posts WHERE id = $3) AND c.created_at >= lo AND c.created_at < hi) AS comments`,
    [from, to, bragPostId],
  );
  const r = rows[0]!;
  return { finished: Number(r.finished), bragClicks: Number(r.clicks), bragComments: Number(r.comments) };
}
