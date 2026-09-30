/**
 * 신뢰도 배지 수동 재계산. 평소에는 server.ts 내장 스케줄러(TRUST_REFRESH_INTERVAL_SEC)가 주기 실행한다.
 */
import { pool } from "../src/lib/db";
import { runTrustBatch } from "../src/lib/jobs/trust";

runTrustBatch()
  .then((r) => {
    console.log(r.ran ? `re-tiered ${r.changed} posts across ${r.categories} categories` : "another batch is running; skipped");
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool().end());
