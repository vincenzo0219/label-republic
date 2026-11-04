import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { beatsTarget, competitionRanks, pickTarget, rankName, topPercent } from "@/lib/gameRank";

describe("🏆 전국 랭킹 · 🏁 지난 기록 도전 (규칙)", () => {
  it("공동 순위: 같은 기록은 같은 순위", () => {
    expect(competitionRanks([10, 8, 8, 5], false)).toEqual([1, 2, 2, 4]);
    expect(competitionRanks([180, 200, 200], true)).toEqual([1, 2, 2]);
  });
  it("상위 %: 최소 1%", () => {
    expect(topPercent(1, 1000)).toBe(1);
    expect(topPercent(3, 10)).toBe(30);
    expect(topPercent(10, 10)).toBe(100);
  });
  it("이름: 닉네임 없으면 익명 덕후 #해시4자", () => {
    expect(rankName(null, "abcdef123")).toBe("익명 덕후 #abcd");
    expect(rankName("  골잡이 ", "abcdef")).toBe("골잡이");
  });
  it("도전 목표: 처음이면 가운데 기록, 기록이 있으면 바로 위, 1등이면 없음", () => {
    const others = [{ score: 3 }, { score: 9 }, { score: 5 }, { score: 7 }];
    expect(pickTarget(others, null, false)?.score).toBe(7); // 9 7 5 3 → 가운데(위쪽)
    expect(pickTarget(others, 5, false)?.score).toBe(7);
    expect(pickTarget(others, 9, false)).toBeNull();
    expect(pickTarget([{ score: 250 }, { score: 200 }, { score: 300 }], 260, true)?.score).toBe(250); // 반응속도: 낮을수록 좋다
    expect(pickTarget([], null, false)).toBeNull();
  });
  it("넘었나: 같으면 못 넘은 것", () => {
    expect(beatsTarget(5, 4, false)).toBe(true);
    expect(beatsTarget(4, 4, false)).toBe(false);
    expect(beatsTarget(190, 200, true)).toBe(true);
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("🏆 전국 랭킹 (DB)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const g = await import("@/lib/repo/miniGames");
  const r = await import("@/lib/repo/gameRank");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  // 11/4(수) 12:00 KST. 이번 주 = 11/2(월)부터
  const now = new Date("2026-11-04T03:00:00Z");
  const lastWeek = new Date("2026-10-30T03:00:00Z");
  const earlyToday = new Date("2026-11-03T16:00:00Z"); // 11/4 01:00 KST

  it("한 사람당 최고 기록, 공동 순위, 내 순위·상위 %", async () => {
    await g.recordPlay("latte", "a", 300, now, "라떼왕");
    await g.recordPlay("latte", "a", 100, now);
    await g.recordPlay("latte", "b", 300, now);
    await g.recordPlay("latte", "c", 200, now);
    const all = await r.gameRanking("latte", "all", "c", now);
    expect(all.total).toBe(3);
    expect(all.rows.map((x) => [x.rank, x.score])).toEqual([[1, 300], [1, 300], [3, 200]]);
    expect(all.rows[0]!.name).toBe("라떼왕"); // 먼저 낸 사람이 위, 닉네임이 보인다
    expect(all.rows[1]!.name).toBe("익명 덕후 #b");
    expect(all.me).toEqual({ rank: 3, total: 3, top: 100, best: 200 });
    expect((await r.gameRanking("latte", "all", null, now)).me).toBeNull();
  });
  it("오늘·이번 주는 KST 날짜로 자른다", async () => {
    await g.recordPlay("rally", "old", 50, lastWeek);
    await g.recordPlay("rally", "dawn", 20, earlyToday);
    await g.recordPlay("rally", "noon", 10, now);
    expect((await r.gameRanking("rally", "all", null, now)).rows.map((x) => x.score)).toEqual([50, 20, 10]);
    expect((await r.gameRanking("rally", "week", null, now)).rows.map((x) => x.score)).toEqual([20, 10]);
    expect((await r.gameRanking("rally", "today", null, now)).rows.map((x) => x.score)).toEqual([20, 10]);
  });
  it("반응속도는 낮을수록 1위", async () => {
    await g.recordPlay("reaction", "x", 250, now);
    await g.recordPlay("reaction", "y", 190, now);
    expect((await r.gameRanking("reaction", "all", "x", now)).me).toMatchObject({ rank: 2, best: 250 });
  });
  it("도전 목표: 내 기록은 빼고 바로 위 기록, 없으면 null", async () => {
    const c = await r.challengeTarget("latte", "c", now);
    expect(c).toMatchObject({ myBest: 200, others: 2 });
    expect(c.target?.score).toBe(300);
    const top = await r.challengeTarget("latte", "a", now);
    expect(top.target).toBeNull();
    expect(top.myBest).toBe(300);
    const none = await r.challengeTarget("pk", "nobody", now);
    expect(none).toEqual({ target: null, myBest: null, others: 0 });
    const first = await r.challengeTarget("rally", "newbie", now);
    expect(first.target?.score).toBe(20); // 50 20 10 의 가운데
  });
});
