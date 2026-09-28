import { pool } from "../db";
import { TRUST_MIN_VOTES } from "../config";
import { reportError } from "../error-tracking";

// 여러 서버 인스턴스가 떠 있어도 배치는 한 곳에서만 돌도록 하는 advisory lock 키
const TRUST_LOCK_KEY = 4_823_001;

export type TrustBatchResult = { ran: boolean; categories: number; changed: number };

/**
 * 모든 카테고리의 신뢰도 배지를 재계산한다.
 * pg_try_advisory_lock으로 동시 실행을 막고, 실행 이력을 trust_batch_runs에 남긴다.
 * 이미 다른 곳에서 실행 중이면 { ran: false } 를 돌려준다.
 */
export async function runTrustBatch(): Promise<TrustBatchResult> {
  const client = await pool().connect();
  try {
    const lock = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [TRUST_LOCK_KEY]);
    if (!lock.rows[0]!.ok) return { ran: false, categories: 0, changed: 0 };
    const run = await client.query<{ id: string }>("INSERT INTO trust_batch_runs DEFAULT VALUES RETURNING id");
    const runId = run.rows[0]!.id;
    let changed = 0;
    let categories = 0;
    try {
      const cats = await client.query<{ id: number }>("SELECT id FROM categories ORDER BY id");
      for (const c of cats.rows) {
        const res = await client.query<{ n: number }>("SELECT refresh_trust_tiers($1, $2) AS n", [c.id, TRUST_MIN_VOTES]);
        changed += res.rows[0]!.n;
        categories++;
      }
      await client.query("UPDATE trust_batch_runs SET finished_at = now(), categories = $2, changed = $3 WHERE id = $1", [
        runId,
        categories,
        changed,
      ]);
      await client.query("DELETE FROM trust_batch_runs WHERE started_at < now() - interval '7 days'");
      return { ran: true, categories, changed };
    } catch (err) {
      await client
        .query("UPDATE trust_batch_runs SET finished_at = now(), error = $2 WHERE id = $1", [runId, String(err)])
        .catch(() => {});
      throw err;
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [TRUST_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

/** server.ts 에서 호출 — 주기적으로 배치를 실행하고 중지 함수를 돌려준다. */
export function startTrustScheduler(intervalMs: number): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runTrustBatch();
      if (r.ran && r.changed > 0) console.log(`[trust] ${r.changed} posts re-tiered across ${r.categories} categories`);
    } catch (err) {
      console.error("[trust] batch failed:", (err as Error).message);
      reportError(err, { kind: "job", where: "trust" });
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
