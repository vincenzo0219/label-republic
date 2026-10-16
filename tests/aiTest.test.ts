import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AI_PAIRS, AI_TEST_MIN_PARTICIPANTS, AI_TEST_TOTAL, aiBragLine, aiTier } from "@/lib/aiTest";

describe("AI test — pure (Sprint 68)", () => {
  it("has ten distinct pairs with a source and a tell", () => {
    expect(AI_TEST_TOTAL).toBe(10);
    for (const p of AI_PAIRS) {
      expect(p.human).not.toBe(p.ai);
      expect(p.author && p.work && p.tell).toBeTruthy();
    }
    expect(new Set(AI_PAIRS.map((p) => p.human)).size).toBe(10);
  });

  it("maps scores to tiers and writes a strict brag line", () => {
    expect(aiTier(10).name).toBe("AI 감별사");
    expect(aiTier(8).name).toBe("예리한 눈");
    expect(aiTier(6).name).toBe("반쯤 속는 사람");
    expect(aiTier(3).name).toBe("AI에 감쪽같이 속음");
    expect(aiBragLine(7)).toBe("🤖 AI 판별 테스트 7/10 (🙂 반쯤 속는 사람) / 주로 쓰는 AI: ");
    for (const bad of [-1, 11, 2.5]) expect(aiBragLine(bad)).toBeNull();
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("AI test (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const ai = await import("@/lib/repo/aiTest");
  const vh = (s: string) => s.padStart(64, "a");

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("counts first attempts, per-question rates and top percent", async () => {
    expect(await ai.saveAiResult(vh("a"), 0b1111111111)).toBe(10);
    await ai.saveAiResult(vh("a"), 0);
    expect(await ai.saveAiResult(vh("b"), 0b0000000001)).toBe(1);
    const s = await ai.aiStats(10);
    expect(s.participants).toBe(2);
    expect(s.byQuestion[0]).toBe(1);
    expect(s.byQuestion[1]).toBe(0.5);
    expect(s.topPercent).toBeNull();
    for (let i = 0; i < AI_TEST_MIN_PARTICIPANTS; i++) await ai.saveAiResult(vh(`p${i}`), 0b11111);
    expect((await ai.aiStats(10)).topPercent).toBe(2);
    expect(await ai.markAiBrag(vh("a"))).toBe(true);
  });
});
