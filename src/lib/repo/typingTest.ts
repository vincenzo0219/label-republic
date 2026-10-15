import { query } from "../db";
import type { EarFunnel } from "../earTest";
import { TYPING_BRAG_POST_ID, TYPING_MIN_PARTICIPANTS, type TypingDevice, type TypingStats } from "../typingTest";
import { markBrag, testFunnel } from "./testFunnel";

/** 결과 저장 (Sprint 67). 다시 해도 저장은 하지만 통계는 첫 응시만 센다. */
export async function saveTypingResult(visitorHash: string, cpm: number, accuracy: number, device: TypingDevice): Promise<void> {
  await query("INSERT INTO typing_test_results (visitor_hash, cpm, accuracy, device) VALUES ($1, $2, $3, $4)", [visitorHash, cpm, accuracy, device]);
}

/** 같은 기기 종류의 첫 응시 기준 통계 + (cpm 이 있으면) 그 기록의 상위 % — PC와 휴대폰은 따로 비교한다 */
export async function typingStats(device: TypingDevice, cpm?: number): Promise<TypingStats> {
  const rows = await query<{ n: number; avg: number | null; acc: number | null; higher: number; equal: number }>(
    `WITH firsts AS (SELECT DISTINCT ON (visitor_hash) cpm, accuracy FROM typing_test_results WHERE device = $1 ORDER BY visitor_hash, id)
     SELECT count(*)::int AS n, avg(cpm)::float AS avg, avg(accuracy)::float AS acc,
            count(*) FILTER (WHERE cpm > $2)::int AS higher, count(*) FILTER (WHERE cpm = $2)::int AS equal
       FROM firsts`,
    [device, cpm ?? -1],
  );
  const r = rows[0]!;
  const n = Number(r.n);
  let topPercent: number | null = null;
  if (cpm !== undefined && n >= TYPING_MIN_PARTICIPANTS) {
    topPercent = Math.min(100, Math.max(1, Math.round(((Number(r.higher) + Number(r.equal) / 2) / n) * 100)));
  }
  return { participants: n, topPercent, average: n ? Math.round(Number(r.avg)) : null, averageAccuracy: n ? Math.round(Number(r.acc)) : null };
}

export const markTypingBrag = (visitorHash: string) => markBrag("typing_test_results", visitorHash);

export const typingFunnel = (from: string, to: string): Promise<EarFunnel> => testFunnel("typing_test_results", TYPING_BRAG_POST_ID, from, to);
