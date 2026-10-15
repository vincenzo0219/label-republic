import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FIRST_LINE_BRAG_POST_ID, FIRST_LINE_MIN_PARTICIPANTS, FIRST_LINE_QUESTIONS, FIRST_LINE_TOTAL, firstLineBragLine, firstLineTier } from "@/lib/firstLineTest";

describe("first line test — pure (Sprint 65)", () => {
  it("has ten questions, each with four distinct titles", () => {
    expect(FIRST_LINE_TOTAL).toBe(10);
    for (const q of FIRST_LINE_QUESTIONS) {
      expect(new Set([q.answer, ...q.others]).size).toBe(4);
      expect(q.line.length).toBeGreaterThan(5);
      expect(q.author).not.toBe("");
    }
    expect(new Set(FIRST_LINE_QUESTIONS.map((q) => q.answer)).size).toBe(10);
  });

  it("maps scores to tiers", () => {
    expect(firstLineTier(10).name).toBe("첫 문장 마스터");
    expect(firstLineTier(8).name).toBe("책벌레");
    expect(firstLineTier(5).name).toBe("꾸준한 독자");
    expect(firstLineTier(3).name).toBe("가끔 독자");
    expect(firstLineTier(0).name).toBe("이제 시작");
  });

  it("writes the brag line only for a valid score", () => {
    expect(firstLineBragLine(7)).toBe("📜 첫 문장 테스트 7/10 (📖 꾸준한 독자) / 요즘 읽는 책: ");
    for (const bad of [-1, 11, 2.5, Number.NaN]) expect(firstLineBragLine(bad)).toBeNull();
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("first line test (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const fl = await import("@/lib/repo/firstLineTest");
  const vh = (s: string) => s.padStart(64, "f");

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("counts first attempts, rates per question, and hides rank until enough people", async () => {
    expect(await fl.saveFirstLineResult(vh("a"), 0b0000000111)).toBe(3);
    await fl.saveFirstLineResult(vh("a"), 1023); // 다시 풀어도 통계는 첫 응시
    expect(await fl.saveFirstLineResult(vh("b"), 0b0000000001)).toBe(1);
    const s = await fl.firstLineStats(3);
    expect(s.participants).toBe(2);
    expect(s.average).toBe(2);
    expect(s.topPercent).toBeNull();
    expect(s.byQuestion[0]).toBe(1);
    expect(s.byQuestion[1]).toBe(0.5);
    expect(s.byQuestion[9]).toBe(0);
    await expect(query("INSERT INTO first_line_test_results (visitor_hash, correct_mask, score) VALUES ('x', 1024, 1)")).rejects.toThrow();
  });

  it("computes top percent and the test → brag → comment funnel", async () => {
    for (let i = 0; i < FIRST_LINE_MIN_PARTICIPANTS; i++) await fl.saveFirstLineResult(vh(`p${i}`), i % 2 ? 0b11 : 0b11111);
    expect((await fl.firstLineStats(10)).topPercent).toBe(1);
    const { kstDay } = await import("@/lib/metrics");
    const today = kstDay();
    expect(await fl.markFirstLineBrag(vh("a"))).toBe(true);
    expect(await fl.markFirstLineBrag(vh("a"))).toBe(false);
    await query(
      `INSERT INTO posts (id, category_id, nickname, pw_hash, title, body, post_type)
       SELECT $1, id, '돈키호테', 'x', '첫 문장 인증', '본문', 'chat' FROM categories ORDER BY id LIMIT 1`,
      [FIRST_LINE_BRAG_POST_ID],
    );
    await query("INSERT INTO comments (post_id, nickname, pw_hash, body) VALUES ($1, '독자', 'x', '7/10'), ($1, '돈키호테', 'x', '와')", [FIRST_LINE_BRAG_POST_ID]);
    expect(await fl.firstLineFunnel(today, today)).toEqual({ finished: FIRST_LINE_MIN_PARTICIPANTS + 2, bragClicks: 1, bragComments: 1 });
  });
});
