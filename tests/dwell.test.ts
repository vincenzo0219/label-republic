import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { query } from "@/lib/db";
import { dwellStats, recordDwell } from "@/lib/metrics";
import { setupTestDb, teardownTestDb } from "./helpers/db";

describe.skipIf(!process.env.TEST_DATABASE_URL)("⏱ 체류시간 (DB)", () => {
  beforeAll(setupTestDb);
  afterAll(teardownTestDb);

  it("페이지별 중앙값·평균 스크롤·표시까지 간 비율", async () => {
    await query("DELETE FROM page_dwell");
    const now = new Date();
    const path = "/c/미혼남녀-만남-행사";
    await recordDwell({ visitorHash: "a".repeat(64), path, categorySlug: "미혼남녀-만남-행사", ms: 10_000, scrollPct: 20, marks: [], now });
    await recordDwell({ visitorHash: "b".repeat(64), path, categorySlug: "미혼남녀-만남-행사", ms: 30_000, scrollPct: 60, marks: ["first-event"], now });
    await recordDwell({ visitorHash: "c".repeat(64), path, categorySlug: "미혼남녀-만남-행사", ms: 50_000, scrollPct: 100, marks: ["first-event"], now });
    const day = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
    const [r] = await dwellStats(day, day, { path });
    expect(r).toMatchObject({ views: 3, median_s: 30, avg_scroll: 60, marks: { "first-event": 67 } });
  });
});
