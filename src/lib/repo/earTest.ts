import { query } from "../db";
import { EAR_MIN_PARTICIPANTS, EAR_ROUNDS, EAR_TOTAL, type EarStats, popcount } from "../earTest";

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

export { EAR_TOTAL };
