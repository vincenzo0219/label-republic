import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TYPING_BRAG_POST_ID, TYPING_MIN_PARTICIPANTS, TYPING_ROUNDS, TYPING_SENTENCES, cpm, keystrokes, scoreLine, typingBragLine, typingTier } from "@/lib/typingTest";

describe("typing test — pure (Sprint 67)", () => {
  it("counts two-beolsik keystrokes per character", () => {
    expect(keystrokes("가")).toBe(2); // ㄱ ㅏ
    expect(keystrokes("한")).toBe(3); // ㅎ ㅏ ㄴ
    expect(keystrokes("과")).toBe(3); // ㄱ ㅗ ㅏ
    expect(keystrokes("닭")).toBe(4); // ㄷ ㅏ ㄹ ㄱ
    expect(keystrokes("뀌")).toBe(3); // ㄲ(시프트 한 번) ㅜ ㅣ
    expect(keystrokes("었")).toBe(3); // ㅇ ㅓ ㅆ
    expect(keystrokes(" ")).toBe(1);
    expect(keystrokes(".")).toBe(1);
  });

  it("scores only correctly typed characters and counts extra ones as wrong", () => {
    expect(scoreLine("가나", "가나")).toEqual({ strokes: 4, correct: 2, total: 2 });
    expect(scoreLine("가나", "가다")).toEqual({ strokes: 2, correct: 1, total: 2 });
    expect(scoreLine("가나", "가나다")).toEqual({ strokes: 4, correct: 2, total: 3 });
    expect(scoreLine("가나", "")).toEqual({ strokes: 0, correct: 0, total: 2 });
  });

  it("turns strokes and time into strokes per minute, capped", () => {
    expect(cpm(100, 60_000)).toBe(100);
    expect(cpm(100, 30_000)).toBe(200);
    expect(cpm(100, 500)).toBe(0); // 너무 짧으면 버림
    expect(cpm(100_000, 60_000)).toBe(1500);
  });

  it("has enough sentences, tiers and a strict brag line", () => {
    expect(TYPING_SENTENCES.length).toBeGreaterThanOrEqual(TYPING_ROUNDS);
    expect(typingTier(720).name).toBe("타자왕");
    expect(typingTier(500).name).toBe("키보드 덕후");
    expect(typingTier(350).name).toBe("빠른 손");
    expect(typingTier(200).name).toBe("보통 타자");
    expect(typingTier(80).name).toBe("독수리 타법");
    expect(typingBragLine(420, 97, "pc")).toBe("⌨️ 한글 타자 테스트 420타 · 정확도 97% (⚡ 빠른 손) / 키보드·축: ");
    expect(typingBragLine(300, 90, "mobile")).toContain("(휴대폰)");
    for (const [s, a] of [[-1, 90], [2000, 90], [300, 101], [300.5, 90]] as const) expect(typingBragLine(s, a, "pc")).toBeNull();
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("typing test (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const ty = await import("@/lib/repo/typingTest");
  const vh = (s: string) => s.padStart(64, "t");

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("keeps PC and phone stats apart and counts first attempts", async () => {
    await ty.saveTypingResult(vh("a"), 300, 95, "pc");
    await ty.saveTypingResult(vh("a"), 900, 99, "pc"); // 다시 해도 첫 응시
    await ty.saveTypingResult(vh("b"), 500, 85, "pc");
    await ty.saveTypingResult(vh("c"), 150, 90, "mobile");
    const pc = await ty.typingStats("pc", 500);
    expect(pc).toEqual({ participants: 2, topPercent: null, average: 400, averageAccuracy: 90 });
    expect((await ty.typingStats("mobile")).participants).toBe(1);
    await expect(query("INSERT INTO typing_test_results (visitor_hash, cpm, accuracy, device) VALUES ('x', 1600, 90, 'pc')")).rejects.toThrow();
    await expect(query("INSERT INTO typing_test_results (visitor_hash, cpm, accuracy, device) VALUES ('x', 100, 90, 'tablet')")).rejects.toThrow();
  });

  it("computes top percent and the brag funnel", async () => {
    for (let i = 0; i < TYPING_MIN_PARTICIPANTS; i++) await ty.saveTypingResult(vh(`p${i}`), 200 + i, 90, "pc");
    expect((await ty.typingStats("pc", 1000)).topPercent).toBe(1);
    const { kstDay } = await import("@/lib/metrics");
    const today = kstDay();
    expect(await ty.markTypingBrag(vh("a"))).toBe(true);
    await query(
      `INSERT INTO posts (id, category_id, nickname, pw_hash, title, body, post_type)
       SELECT $1, id, '덕후1호', 'x', '타자 인증', '본문', 'chat' FROM categories ORDER BY id LIMIT 1`,
      [TYPING_BRAG_POST_ID],
    );
    await query("INSERT INTO comments (post_id, nickname, pw_hash, body) VALUES ($1, '타자왕', 'x', '600타')", [TYPING_BRAG_POST_ID]);
    expect(await ty.typingFunnel(today, today)).toEqual({ finished: TYPING_MIN_PARTICIPANTS + 3, bragClicks: 1, bragComments: 1 });
  });
});
