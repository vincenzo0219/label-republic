import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sentencePairOf, typeLabel } from "@/lib/sentencePick";

describe("📖 어느 문장이 더 끌려요? 규칙", () => {
  it("날마다 새 쌍, 60일 동안 겹치지 않는다", () => {
    const a = sentencePairOf("2026-11-02");
    expect(a.options[0]).toBe("창밖의 비가 오래된 편지처럼 천천히 번져 갔다.");
    const seen = new Set<string>();
    for (let d = 0; d < 60; d++) {
      const day = new Date(Date.UTC(2026, 10, 2 + d)).toISOString().slice(0, 10);
      const p = sentencePairOf(day);
      expect(typeLabel(p.types[0])).not.toBe("");
      expect(typeLabel(p.types[1])).not.toBe("");
      expect(p.types[0]).not.toBe(p.types[1]);
      seen.add(p.options.join("|"));
    }
    expect(seen.size).toBe(60);
    expect(sentencePairOf("2027-01-01").no).toBe(0); // 60일 뒤 처음부터
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("📖 어느 문장이 더 끌려요? (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { pickSentence, sentenceCard } = await import("@/lib/repo/sentencePick");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });
  it("고르기 전엔 비율이 안 보이고, 한 번만 센다", async () => {
    const day = "2031-01-01";
    expect((await sentenceCard(day, "v1")).counts).toBeNull();
    const r = await pickSentence(day, "v1", 1);
    expect(r.mine).toBe(1);
    expect(r.counts).toEqual([0, 1]);
    expect((await pickSentence(day, "v1", 0)).mine).toBe(1);
    await pickSentence(day, "v2", 0);
    expect((await sentenceCard(day, "v2")).counts).toEqual([1, 1]);
  });
});
