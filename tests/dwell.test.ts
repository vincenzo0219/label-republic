import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("⏱ 체류시간 (10/29)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { dwellStats, recordDwell } = await import("@/lib/metrics");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("페이지별 중앙값·평균 스크롤·첫 행사 카드까지 간 비율", async () => {
    const now = new Date();
    const p = "/c/미혼남녀-만남-행사";
    const add = (v: string, ms: number, scrollPct: number, marks: string[]) =>
      recordDwell({ visitorHash: v.repeat(64), path: p, categorySlug: "미혼남녀-만남-행사", ms, scrollPct, marks, now });
    await add("a", 10_000, 20, []);
    await add("b", 30_000, 60, ["first-event"]);
    await add("c", 50_000, 100, ["first-event"]);
    const day = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
    const [r] = await dwellStats(day, day, { path: p });
    expect(r).toMatchObject({ views: 3, median_s: 30, avg_scroll: 60, marks: { "first-event": 67 } });
    expect(await dwellStats(day, day, { path: "/없는곳" })).toEqual([]);
  });
});
