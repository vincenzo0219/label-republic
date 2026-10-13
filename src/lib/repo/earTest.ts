import { query } from "../db";
import { EAR_BRAG_POST_ID, EAR_MIN_PARTICIPANTS, EAR_ROUNDS, EAR_TOTAL, type EarFunnel, type EarStats, popcount } from "../earTest";

/** 결과 저장 (Sprint 59). 같은 방문자가 다시 풀어도 저장은 하지만 통계는 첫 응시만 센다. */
export async function saveEarResult(visitorHash: string, mask: number): Promise<number> {
  const score = popcount(mask);
  await query("INSERT INTO ear_test_results (visitor_hash, correct_mask, score) VALUES ($1, $2, $3)", [visitorHash, mask, score]);
  return score;
}

/** 첫 응시 기준 통계 + (score 가 있으면) 그 점수의 상위 % */
export async function earStats(score?: number): Promise<EarStats> {
  const bits = EAR_ROUNDS.map((_, i) => `avg((correct_mask >> ${i}) & 1)::float AS b${i}`).join(", ");
  const rows = await query<Record<string, number | string | null>>(
    `WITH firsts AS (SELECT DISTINCT ON (visitor_hash) correct_mask, score FROM ear_test_results ORDER BY visitor_hash, id)
     SELECT count(*)::int AS n, avg(score)::float AS avg,
            count(*) FILTER (WHERE score > $1)::int AS higher, count(*) FILTER (WHERE score = $1)::int AS equal, ${bits}
       FROM firsts`,
    [score ?? -1],
  );
  const r = rows[0]!;
  const n = Number(r.n);
  // 같은 음질 문제끼리 묶어서 정답률
  const groups = new Map<number, number[]>();
  EAR_ROUNDS.forEach((round, i) => groups.set(round.kbps, [...(groups.get(round.kbps) ?? []), Number(r[`b${i}`] ?? 0)]));
  const byKbps = n ? [...groups].map(([kbps, rates]) => ({ kbps, rate: rates.reduce((a, b) => a + b, 0) / rates.length })) : [];
  let topPercent: number | null = null;
  if (score !== undefined && n >= EAR_MIN_PARTICIPANTS) {
    // 나보다 높은 사람 + 같은 점수의 절반 → 상위 %
    topPercent = Math.min(100, Math.max(1, Math.round(((Number(r.higher) + Number(r.equal) / 2) / n) * 100)));
  }
  return { participants: n, topPercent, average: n ? Math.round(Number(r.avg) * 10) / 10 : null, byKbps };
}

/** "점수 인증하기"를 누름 — 그 방문자의 마지막 결과에 시각을 남긴다 (Sprint 60). 결과가 없으면 아무것도 안 한다. */
export async function markEarBrag(visitorHash: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE ear_test_results SET bragged_at = now()
      WHERE id = (SELECT max(id) FROM ear_test_results WHERE visitor_hash = $1) AND bragged_at IS NULL
      RETURNING id`,
    [visitorHash],
  );
  return rows.length > 0;
}

/** 테스트 → 인증 버튼 → 인증 댓글 깔때기. from·to 는 KST 날짜(포함). 인증 댓글은 글쓴이(덕후1호)·AI 댓글을 뺀다. */
export async function earFunnel(from: string, to: string): Promise<EarFunnel> {
  const rows = await query<{ finished: number; clicks: number; comments: number }>(
    `WITH firsts AS (SELECT DISTINCT ON (visitor_hash) visitor_hash, created_at FROM ear_test_results ORDER BY visitor_hash, id),
          win AS (SELECT ($1::date)::timestamp AT TIME ZONE 'Asia/Seoul' AS lo, ($2::date + 1)::timestamp AT TIME ZONE 'Asia/Seoul' AS hi)
     SELECT (SELECT count(*)::int FROM firsts, win WHERE created_at >= lo AND created_at < hi) AS finished,
            (SELECT count(DISTINCT visitor_hash)::int FROM ear_test_results, win WHERE bragged_at >= lo AND bragged_at < hi) AS clicks,
            (SELECT count(*)::int FROM comments c, win WHERE c.post_id = $3 AND NOT c.is_ai_curated
                AND c.nickname IS DISTINCT FROM (SELECT nickname FROM posts WHERE id = $3) AND c.created_at >= lo AND c.created_at < hi) AS comments`,
    [from, to, EAR_BRAG_POST_ID],
  );
  const r = rows[0]!;
  return { finished: Number(r.finished), bragClicks: Number(r.clicks), bragComments: Number(r.comments) };
}

export { EAR_TOTAL };
