import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EAR_MIN_PARTICIPANTS, EAR_ROUNDS, EAR_TOTAL, earTier, popcount } from "@/lib/earTest";

describe("ear test — pure (Sprint 59)", () => {
  it("has 10 rounds whose audio files exist and are the same size (size must not reveal the answer)", () => {
    expect(EAR_TOTAL).toBe(10);
    for (const r of EAR_ROUNDS) {
      const o = path.join(process.cwd(), "public", r.orig);
      const c = path.join(process.cwd(), "public", r.comp);
      expect(existsSync(o) && existsSync(c)).toBe(true);
      expect(statSync(o).size).toBe(statSync(c).size);
      // 파일 이름에 원본·압축 여부가 드러나지 않는다
      expect(`${r.orig}${r.comp}`).not.toMatch(/orig|comp|mp3|kbps/i);
    }
    // 뒤로 갈수록 어려워진다 (압축률이 낮아진다)
    const k = EAR_ROUNDS.map((r) => r.kbps);
    expect([...k].sort((a, b) => a - b)).toEqual(k);
  });

  it("counts bits and maps scores to tiers", () => {
    expect(popcount(0)).toBe(0);
    expect(popcount(1023)).toBe(10);
    expect(popcount(0b1010000001)).toBe(3);
    expect(earTier(10).name).toBe("황금귀");
    expect(earTier(8).name).toBe("덕후 귀");
    expect(earTier(7).name).toBe("예민한 귀");
    expect(earTier(5).name).toBe("평범한 귀");
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("ear test (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const ear = await import("@/lib/repo/earTest");
  const vh = (s: string) => s.padStart(64, "e");

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("stores results, counts only each visitor's first attempt, and hides rank until enough people took it", async () => {
    expect((await ear.earStats()).participants).toBe(0);
    expect(await ear.saveEarResult(vh("a"), 0b0000000111)).toBe(3);
    // 같은 사람이 다시 풀어 만점을 받아도 통계는 첫 응시(3점) 그대로
    await ear.saveEarResult(vh("a"), 1023);
    const s = await ear.earStats(10);
    expect(s.participants).toBe(1);
    expect(s.average).toBe(3);
    expect(s.topPercent).toBeNull(); // 참가자가 적으면 순위를 보여 주지 않는다
    expect(s.byKbps.find((b) => b.kbps === 64)!.rate).toBe(1); // 1·2번(64kbps) 맞힘
    expect(s.byKbps.find((b) => b.kbps === 192)!.rate).toBe(0);
  });

  it("computes the top percent among first attempts", async () => {
    // 참가자를 기준 인원까지 채운다: 절반은 5점, 절반은 8점
    for (let i = 0; i < EAR_MIN_PARTICIPANTS; i++) await ear.saveEarResult(vh(`p${i}`), i % 2 ? 0b0000011111 : 0b0011111111);
    const n = EAR_MIN_PARTICIPANTS + 1;
    const top10 = await ear.earStats(10);
    expect(top10.participants).toBe(n);
    expect(top10.topPercent).toBe(1); // 아무도 10점(첫 응시)이 아니어도 최소 1%
    const s8 = await ear.earStats(8);
    expect(s8.topPercent).toBe(Math.round(((EAR_MIN_PARTICIPANTS / 2) / 2 / n) * 100));
    await expect(query("INSERT INTO ear_test_results (visitor_hash, correct_mask, score) VALUES ('x', 1024, 1)")).rejects.toThrow();
  });
});
