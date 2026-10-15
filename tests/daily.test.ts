import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DAILY_LINES, DAILY_START, dailyNumber, dailySet, dailyShareLine, streakOf } from "@/lib/daily";
import { FIRST_LINE_QUESTIONS } from "@/lib/firstLineTest";

describe("daily challenge — pure (Sprint 66)", () => {
  it("numbers days from the start and rotates questions", () => {
    expect(dailyNumber(DAILY_START)).toBe(0);
    expect(dailyNumber("2026-10-16")).toBe(1);
    expect(dailyNumber("2026-10-01")).toBe(0); // 첫 회 전
    expect(dailySet(DAILY_START).no).toBe(1);
    expect(dailySet("2026-10-16").line).not.toEqual(dailySet(DAILY_START).line);
    // 15일 뒤에는 첫 문제로 돌아온다
    expect(dailySet("2026-10-30").line).toEqual(dailySet(DAILY_START).line);
  });

  it("never repeats the first-line test's questions and each has four titles", () => {
    const test = new Set(FIRST_LINE_QUESTIONS.map((q) => q.answer));
    for (const q of DAILY_LINES) {
      expect(test.has(q.answer)).toBe(false);
      expect(new Set([q.answer, ...q.others]).size).toBe(4);
    }
    expect(new Set(DAILY_LINES.map((q) => q.answer)).size).toBe(DAILY_LINES.length);
  });

  it("counts a streak through today or yesterday", () => {
    expect(streakOf([], "2026-10-20")).toBe(0);
    expect(streakOf(["2026-10-18", "2026-10-19", "2026-10-20"], "2026-10-20")).toBe(3);
    expect(streakOf(["2026-10-18", "2026-10-19"], "2026-10-20")).toBe(2); // 오늘 아직 안 풂
    expect(streakOf(["2026-10-17", "2026-10-19", "2026-10-20"], "2026-10-20")).toBe(2);
    expect(streakOf(["2026-10-17"], "2026-10-20")).toBe(0);
    expect(streakOf(["2026-10-31", "2026-11-01"], "2026-11-01")).toBe(2); // 달이 바뀌어도
  });

  it("shares a spoiler-free line", () => {
    expect(dailyShareLine(3, true, false, 3)).toBe("노방장 오늘의 문제 #3 📜⭕ 🎧❌ 🔥3일째");
    expect(dailyShareLine(1, false, true, 1)).toBe("노방장 오늘의 문제 #1 📜❌ 🎧⭕");
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("daily challenge (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const daily = await import("@/lib/repo/daily");

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("keeps the first answer per day and kind, and counts repeat players", async () => {
    await daily.saveDailyAnswer("2026-10-16", "a", "line", true);
    await daily.saveDailyAnswer("2026-10-16", "a", "line", false); // 다시 풀어도 처음 답
    await daily.saveDailyAnswer("2026-10-16", "b", "line", false);
    await daily.saveDailyAnswer("2026-10-16", "a", "ear", false);
    await daily.saveDailyAnswer("2026-10-17", "a", "line", true);
    const s = await daily.dailyStats("2026-10-16");
    expect(s.line).toEqual({ participants: 2, rate: 0.5 });
    expect(s.ear).toEqual({ participants: 1, rate: 0 });
    expect((await daily.dailyStats("2026-10-18")).line).toEqual({ participants: 0, rate: null });
    expect(await daily.dailyPlayers("2026-10-16", "2026-10-17")).toEqual({ players: 2, repeat: 1 });
  });
});
