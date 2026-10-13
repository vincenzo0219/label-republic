import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HEARING_BRAG_POST_ID, HEARING_GAIN, HEARING_MIN_PARTICIPANTS, HEARING_STEPS, hearingBragLine, hearingTier } from "@/lib/hearingTest";

describe("hearing test — pure (Sprint 61)", () => {
  it("climbs from 8 to 20 kHz at a fixed, modest level", () => {
    expect(HEARING_STEPS[0]).toBe(8);
    expect(HEARING_STEPS.at(-1)).toBe(20);
    expect([...HEARING_STEPS].sort((a, b) => a - b)).toEqual(HEARING_STEPS);
    expect(HEARING_GAIN).toBeGreaterThan(0);
    expect(HEARING_GAIN).toBeLessThanOrEqual(0.1); // 귀에 무리가 가지 않게
  });

  it("maps results to tiers", () => {
    expect(hearingTier(19).name).toBe("모기 귀");
    expect(hearingTier(17).name).toBe("돌고래 귀");
    expect(hearingTier(15).name).toBe("또렷한 귀");
    expect(hearingTier(12).name).toBe("평범한 귀");
    expect(hearingTier(8).name).toBe("편안한 귀");
    expect(hearingTier(0).name).toBe("확인 필요");
  });

  it("prefills the brag comment only for a step frequency or 0", () => {
    expect(hearingBragLine("17")).toBe("🦟 고음 청력 테스트 17kHz까지 들림 (🐬 돌고래 귀) / 나이대·장비: ");
    expect(hearingBragLine("0")).toContain("8kHz도 안 들림");
    for (const bad of [null, undefined, "", "9", "21", "17.5", "017", "17 욕", "<b>"]) expect(hearingBragLine(bad)).toBeNull();
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("hearing test (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const hear = await import("@/lib/repo/hearingTest");
  const vh = (s: string) => s.padStart(64, "h");

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("counts first attempts, rates per frequency, and hides rank until enough people", async () => {
    await hear.saveHearingResult(vh("a"), 15);
    await hear.saveHearingResult(vh("a"), 20); // 다시 해도 통계는 첫 응시(15)
    await hear.saveHearingResult(vh("b"), 0);
    const s = await hear.hearingStats(15);
    expect(s.participants).toBe(2);
    expect(s.average).toBe(7.5);
    expect(s.topPercent).toBeNull();
    expect(s.byKhz.find((b) => b.khz === 8)!.rate).toBe(0.5);
    expect(s.byKhz.find((b) => b.khz === 15)!.rate).toBe(0.5);
    expect(s.byKhz.find((b) => b.khz === 16)!.rate).toBe(0);
    await expect(query("INSERT INTO hearing_test_results (visitor_hash, max_khz) VALUES ('x', 21)")).rejects.toThrow();
  });

  it("computes top percent and the test → brag → comment funnel", async () => {
    for (let i = 0; i < HEARING_MIN_PARTICIPANTS; i++) await hear.saveHearingResult(vh(`p${i}`), i % 2 ? 12 : 17);
    const n = HEARING_MIN_PARTICIPANTS + 2;
    expect((await hear.hearingStats(20)).topPercent).toBe(1);
    // 17kHz: 나보다 높은 사람 0, 같은 사람 절반(10명)의 반
    expect((await hear.hearingStats(17)).topPercent).toBe(Math.round(((HEARING_MIN_PARTICIPANTS / 2) / 2 / n) * 100));

    const { kstDay } = await import("@/lib/metrics");
    const today = kstDay();
    expect(await hear.markHearingBrag(vh("a"))).toBe(true);
    expect(await hear.markHearingBrag(vh("a"))).toBe(false);
    expect(await hear.markHearingBrag(vh("nobody"))).toBe(false);
    await query(
      `INSERT INTO posts (id, category_id, nickname, pw_hash, title, body, post_type)
       SELECT $1, id, '덕후1호', 'x', '청력 인증', '본문', 'chat' FROM categories ORDER BY id LIMIT 1`,
      [HEARING_BRAG_POST_ID],
    );
    await query("INSERT INTO comments (post_id, nickname, pw_hash, body) VALUES ($1, '사람', 'x', '17kHz'), ($1, '덕후1호', 'x', '와')", [HEARING_BRAG_POST_ID]);
    expect(await hear.hearingFunnel(today, today)).toEqual({ finished: n, bragClicks: 1, bragComments: 1 });
  });
});
