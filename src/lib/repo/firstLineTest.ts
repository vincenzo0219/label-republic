import { query } from "../db";
import type { EarFunnel } from "../earTest";
import { popcount } from "../earTest";
import { FIRST_LINE_BRAG_POST_ID, FIRST_LINE_MIN_PARTICIPANTS, FIRST_LINE_QUESTIONS, type FirstLineStats } from "../firstLineTest";
import { markBrag, testFunnel } from "./testFunnel";

/** 결과 저장 (Sprint 65). 다시 풀어도 저장은 하지만 통계는 첫 응시만 센다. */
export async function saveFirstLineResult(visitorHash: string, mask: number): Promise<number> {
  const score = popcount(mask);
  await query("INSERT INTO first_line_test_results (visitor_hash, correct_mask, score) VALUES ($1, $2, $3)", [visitorHash, mask, score]);
  return score;
}

/** 첫 응시 기준 통계 + (score 가 있으면) 그 점수의 상위 % */
export async function firstLineStats(score?: number): Promise<FirstLineStats> {
  const bits = FIRST_LINE_QUESTIONS.map((_, i) => `avg((correct_mask >> ${i}) & 1)::float AS b${i}`).join(", ");
  const rows = await query<Record<string, number | string | null>>(
    `WITH firsts AS (SELECT DISTINCT ON (visitor_hash) correct_mask, score FROM first_line_test_results ORDER BY visitor_hash, id)
     SELECT count(*)::int AS n, avg(score)::float AS avg,
            count(*) FILTER (WHERE score > $1)::int AS higher, count(*) FILTER (WHERE score = $1)::int AS equal, ${bits}
       FROM firsts`,
    [score ?? -1],
  );
  const r = rows[0]!;
  const n = Number(r.n);
  let topPercent: number | null = null;
  if (score !== undefined && n >= FIRST_LINE_MIN_PARTICIPANTS) {
    topPercent = Math.min(100, Math.max(1, Math.round(((Number(r.higher) + Number(r.equal) / 2) / n) * 100)));
  }
  return {
    participants: n,
    topPercent,
    average: n ? Math.round(Number(r.avg) * 10) / 10 : null,
    byQuestion: n ? FIRST_LINE_QUESTIONS.map((_, i) => Number(r[`b${i}`] ?? 0)) : [],
  };
}

export const markFirstLineBrag = (visitorHash: string) => markBrag("first_line_test_results", visitorHash);

export const firstLineFunnel = (from: string, to: string): Promise<EarFunnel> => testFunnel("first_line_test_results", FIRST_LINE_BRAG_POST_ID, from, to);
