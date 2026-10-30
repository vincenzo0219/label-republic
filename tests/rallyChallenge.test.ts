import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { beats, challengeText, cleanName, gapTo, isChallengeId, newChallengeId, seededRandom, validRallyScore, validSeed } from "@/lib/rallyChallenge";

describe("🎾 랠리 도전장 (규칙)", () => {
  it("같은 seed 면 공 순서가 같다", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const c = seededRandom(43);
    const sa = Array.from({ length: 20 }, () => a());
    expect(Array.from({ length: 20 }, () => b())).toEqual(sa);
    expect(Array.from({ length: 20 }, () => c())).not.toEqual(sa);
    expect(sa.every((x) => x >= 0 && x < 1)).toBe(true);
  });
  it("넘었나: 같으면 못 넘은 것, 모자란 수", () => {
    expect(beats(24, 23)).toBe(true);
    expect(beats(23, 23)).toBe(false);
    expect(gapTo(23, 23)).toBe(1);
    expect(gapTo(20, 23)).toBe(4);
    expect(gapTo(30, 23)).toBe(0);
  });
  it("범위·id·이름", () => {
    expect(validRallyScore(0)).toBe(true);
    expect(validRallyScore(300)).toBe(true);
    expect(validRallyScore(301)).toBe(false);
    expect(validRallyScore(-1)).toBe(false);
    expect(validRallyScore(2.5)).toBe(false);
    expect(validSeed(-1)).toBe(false);
    expect(validSeed(123)).toBe(true);
    expect(isChallengeId(newChallengeId())).toBe(true);
    expect(isChallengeId("../etc")).toBe(false);
    expect(cleanName("  ")).toBe("테니스 덕후");
    expect(cleanName("가".repeat(30))).toHaveLength(20);
    expect(challengeText(23, "abcd2345")).toBe("🎾 랠리 탭 23번 받았어요. 이길 수 있어요? nobangjang.com/games/rally?c=abcd2345");
    expect(challengeText(1, "x")).not.toMatch(/—/);
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("🎾 랠리 도전장 (DB)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const r = await import("@/lib/repo/rallyChallenges");
  const g = await import("@/lib/repo/miniGames");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("만들고, 도전하고, 사람 수는 한 번만 센다", async () => {
    const c = await r.createChallenge({ visitor: "maker", score: 10, seed: 7, name: "" });
    expect(c).toMatchObject({ score: 10, name: "테니스 덕후", seed: 7, tries: 0, wins: 0 });
    expect(await r.getChallenge(c.id)).toMatchObject({ id: c.id, score: 10, tries: 0 });
    expect(await r.getChallenge("nope")).toBeNull();

    const a1 = await r.recordAttempt(c.id, "p1", 10);
    expect(a1).toMatchObject({ beat: false, target: 10, challenge: { tries: 1, wins: 0 } });
    const a2 = await r.recordAttempt(c.id, "p1", 11);
    expect(a2).toMatchObject({ beat: true, challenge: { tries: 1, wins: 1 } });
    const a3 = await r.recordAttempt(c.id, "p2", 3);
    expect(a3?.challenge).toMatchObject({ tries: 2, wins: 1 });
    expect(await r.recordAttempt("zzzzzzzz", "p1", 3)).toBeNull();

    // 되갚기 도전장은 받은 도전장을 parent 로
    const back = await r.createChallenge({ visitor: "p1", score: 11, seed: 7, name: "되갚는 사람", parent: c.id });
    const [row] = await query<{ parent_id: string }>("SELECT parent_id FROM rally_challenges WHERE id = $1", [back.id]);
    expect(row?.parent_id).toBe(c.id);
  });

  it("관리자 숫자: 만든 수·링크로 연 수·그날 처음 온 사람·도전·이긴 판", async () => {
    await query("INSERT INTO visitors (visitor_hash, last_day) VALUES ($1, (now() AT TIME ZONE 'Asia/Seoul')::date)", ["n".repeat(64)]);
    await g.recordOpen("rally", "n".repeat(64), "challenge");
    await g.recordOpen("rally", "p1", "challenge");
    const s = await r.challengeStats(7);
    expect(s).toEqual({ created: 2, opens: 2, newVisitors: 1, attempts: 3, challengers: 2, wins: 1 });
  });
});
