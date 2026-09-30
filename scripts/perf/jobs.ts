/**
 * 배치 작업 소요 시간 측정 (부하 테스트용 DB에서).
 *
 *   DATABASE_URL=.../labelrep_perf npx tsx scripts/perf/jobs.ts
 */
async function main() {
  const { pool } = await import("../../src/lib/db");
  const { runTrustBatch } = await import("../../src/lib/jobs/trust");
  const { runMaintenance } = await import("../../src/lib/jobs/maintenance");
  const { runDigestBatch } = await import("../../src/lib/jobs/digest");
  const metrics = await import("../../src/lib/repo/metrics");
  const time = async (label: string, fn: () => Promise<unknown>) => {
    const t = performance.now();
    const r = await fn();
    console.log(label.padEnd(40), `${String(Math.round(performance.now() - t)).padStart(6)}ms`, JSON.stringify(r)?.slice(0, 120));
  };
  await time("신뢰도 배지 배치", () => runTrustBatch());
  await time("신뢰도 배지 배치 (재실행)", () => runTrustBatch());
  await time("유지보수 배치", () => runMaintenance());
  await time("다이제스트 배치", () => runDigestBatch());
  const day = (offset: number) => new Date(Date.now() + 9 * 3600e3 - offset * 86400e3).toISOString().slice(0, 10);
  for (const range of [7, 30, 90]) {
    const cur = [day(range - 1), day(0)] as const;
    const each: [string, () => Promise<unknown>][] = [
      ["dailySeries", () => metrics.dailySeries(Math.max(30, 2 * range))],
      ["periodVisitors", () => metrics.periodVisitors(...cur)],
      ["sourceBreakdown", () => metrics.sourceBreakdown(...cur)],
      ["topReferrers", () => metrics.topReferrers(...cur, "search")],
      ["topSearchLandingPosts", () => metrics.topSearchLandingPosts(...cur)],
      ["topViewedPosts", () => metrics.topViewedPosts(...cur)],
      ["topInternalSearches", () => metrics.topInternalSearches(...cur)],
      ["boardStats", () => metrics.boardStats()],
      ["moderationCounts", () => metrics.moderationCounts()],
    ];
    for (const [name, fn] of each) await time(`대시보드 ${range}일 ${name}`, async () => ((await fn()), undefined));
  }
  await pool().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
