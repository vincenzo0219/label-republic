import { query } from "../db";
import type { SimStats, SimType } from "../someSim";

/** 결과 저장 (10/28). 다시 해도 저장은 하지만 통계는 방문자마다 첫 결과만 */
export async function saveSimResult(visitorHash: string, r: { type: SimType; anx: number; avo: number }): Promise<void> {
  await query("INSERT INTO some_sim_results (visitor_hash, sim_type, anx, avo) VALUES ($1, $2, $3, $4)", [visitorHash, r.type, r.anx, r.avo]);
}

export async function simStats(): Promise<SimStats> {
  const rows = await query<{ sim_type: SimType; n: number }>(
    `WITH firsts AS (SELECT DISTINCT ON (visitor_hash) sim_type FROM some_sim_results ORDER BY visitor_hash, id)
     SELECT sim_type, count(*)::int AS n FROM firsts GROUP BY sim_type`,
  );
  const total = rows.reduce((s, r) => s + r.n, 0);
  const share: Record<SimType, number> = { sunny: 0, shower: 0, fog: 0, storm: 0 };
  for (const r of rows) share[r.sim_type] = total ? Math.round((r.n / total) * 100) : 0;
  return { participants: total, share };
}
