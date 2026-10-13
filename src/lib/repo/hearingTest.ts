import { query } from "../db";
import type { EarFunnel } from "../earTest";
import { HEARING_BRAG_POST_ID, HEARING_MIN_PARTICIPANTS, HEARING_STEPS, type HearingStats } from "../hearingTest";
import { markBrag, testFunnel } from "./testFunnel";

/** 결과 저장 (Sprint 61). 다시 해도 저장은 하지만 통계는 첫 응시만 센다. */
export async function saveHearingResult(visitorHash: string, maxKhz: number): Promise<void> {
  await query("INSERT INTO hearing_test_results (visitor_hash, max_khz) VALUES ($1, $2)", [visitorHash, maxKhz]);
}

/** 첫 응시 기준 통계 + (khz 가 있으면) 그 결과의 상위 % */
export async function hearingStats(khz?: number): Promise<HearingStats> {
  const rates = HEARING_STEPS.map((f, i) => `avg((max_khz >= ${f})::int)::float AS r${i}`).join(", ");
  const rows = await query<Record<string, number | string | null>>(
    `WITH firsts AS (SELECT DISTINCT ON (visitor_hash) max_khz FROM hearing_test_results ORDER BY visitor_hash, id)
     SELECT count(*)::int AS n, avg(max_khz)::float AS avg,
            count(*) FILTER (WHERE max_khz > $1)::int AS higher, count(*) FILTER (WHERE max_khz = $1)::int AS equal, ${rates}
       FROM firsts`,
    [khz ?? -1],
  );
  const r = rows[0]!;
  const n = Number(r.n);
  const byKhz = n ? HEARING_STEPS.map((f, i) => ({ khz: f, rate: Number(r[`r${i}`] ?? 0) })) : [];
  let topPercent: number | null = null;
  if (khz !== undefined && n >= HEARING_MIN_PARTICIPANTS) {
    topPercent = Math.min(100, Math.max(1, Math.round(((Number(r.higher) + Number(r.equal) / 2) / n) * 100)));
  }
  return { participants: n, topPercent, average: n ? Math.round(Number(r.avg) * 10) / 10 : null, byKhz };
}

export const markHearingBrag = (visitorHash: string) => markBrag("hearing_test_results", visitorHash);

export const hearingFunnel = (from: string, to: string): Promise<EarFunnel> => testFunnel("hearing_test_results", HEARING_BRAG_POST_ID, from, to);
