import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sentencePairOf, typeLabel } from "@/lib/sentencePick";

describe("📖 어느 문장이 더 끌려요? 규칙", () => {
  it("날마다 다른 쌍, 12일마다 돈다", () => {
    const a = sentencePairOf("2026-11-02");
    expect(sentencePairOf("2026-11-03").no).not.toBe(a.no);
    expect(sentencePairOf("2026-11-14").no).toBe(a.no);
    expect(typeLabel(a.types[0])).not.toBe("");
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
