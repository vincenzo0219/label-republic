import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { predictionProblem, streakBadge, streakOf, weekStart } from "@/lib/predictions";

// 🎯 승부 예측 (11/2 대표님 "보상은 배지, 그리고 스코어까지")
describe("predictions rules", () => {
  it("counts streaks from the latest result and badges from 3", () => {
    expect(streakOf([true, true, false, true])).toBe(2);
    expect(streakOf([true, true, true])).toBe(3);
    expect(streakOf([])).toBe(0);
    expect(streakBadge(2)).toBeUndefined();
    expect(streakBadge(3)).toBe("🎯3연속");
    expect(streakBadge(5, "📈")).toBe("📈5연속");
  });
  it("starts the week on Monday 00:00 KST", () => {
    // 11/2 (월) 10:00 KST
    expect(weekStart(new Date("2026-11-02T01:00:00Z"))).toBe("2026-11-01T15:00:00.000Z");
    // 11/1 (일) 23:00 KST → 지난주 월요일 10/26
    expect(weekStart(new Date("2026-11-01T14:00:00Z"))).toBe("2026-10-25T15:00:00.000Z");
  });
  it("validates operator questions", () => {
    const ok = { room: "kbo-덕후방", title: "한국시리즈 1차전 승자는?", options: ["KT", "삼성"], closesAt: "2026-11-03T09:30:00Z" };
    expect(predictionProblem(ok)).toBeNull();
    expect(predictionProblem({ ...ok, room: "주식" })).not.toBeNull();
    expect(predictionProblem({ ...ok, options: ["KT"] })).not.toBeNull();
    expect(predictionProblem({ ...ok, options: ["KT", "KT"] })).not.toBeNull();
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("predictions (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const repo = await import("@/lib/repo/predictions");
  const { badgesFor } = await import("@/lib/repo/badges");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("one pick per browser before closing, points and streak after results, weekly board, badge", async () => {
    const now = new Date("2026-11-02T03:00:00Z");
    const mk = (n: number) =>
      repo.createPrediction({ room: "kbo-덕후방", title: `${n}차전 승자는?`, options: ["KT", "삼성"], closesAt: "2026-11-02T09:00:00Z", seedKey: `kbo:${n}` });
    const qs = [await mk(1), await mk(2), await mk(3)];
    expect((await mk(1)).id).toBe(qs[0]!.id); // 같은 seed 는 한 번
    for (const q of qs) await repo.pickPrediction({ id: q.id, visitor: "v1", nickname: "수원 직관러", choice: 0 }, now);
    // 두 번째 고르기는 무시
    const again = await repo.pickPrediction({ id: qs[0]!.id, visitor: "v1", nickname: "수원 직관러", choice: 1 }, now);
    expect(again.open.find((o) => o.id === qs[0]!.id)?.mine).toBe(0);
    await repo.pickPrediction({ id: qs[0]!.id, visitor: "v2", nickname: "대구", choice: 1 }, now);
    // 마감 뒤에는 못 고른다
    await expect(repo.pickPrediction({ id: qs[1]!.id, visitor: "v3", choice: 0 }, new Date("2026-11-02T10:00:00Z"))).rejects.toThrow();
    for (const q of qs) await repo.resolvePrediction(q.id, 0);
    const card = await repo.predictCard("kbo-덕후방", "v1", "수원 직관러", new Date("2026-11-02T12:00:00Z"));
    expect(card.me).toEqual({ score: 30, wins: 3, losses: 0, streak: 3 });
    expect(card.board[0]).toMatchObject({ name: "수원 직관러", score: 30, me: true });
    expect(card.board.find((b) => b.name === "대구")).toBeUndefined(); // 0점은 순위에 없음
    expect(card.recent[0]).toMatchObject({ ok: true });
    const badges = await badgesFor("k리그-덕후방", ["수원직관러", "대구"]);
    expect(badges["수원직관러"]).toBe("🎯3연속");
    expect(badges["대구"]).toBeUndefined();
    expect((await repo.listPredictions()).length).toBe(3);
  });

  it("gives a 📈 streak badge for KOSPI picks by nickname", async () => {
    await query("INSERT INTO kospi_closes (day, close) VALUES ('2026-10-26', 100), ('2026-10-27', 101), ('2026-10-28', 102), ('2026-10-29', 101.5)");
    for (const [day, side] of [["2026-10-27", 1], ["2026-10-28", 1], ["2026-10-29", -1]] as const)
      await query("INSERT INTO kospi_picks (day, visitor_hash, nickname, room, side) VALUES ($1, 'k1', '코스피 고수', '주식', $2)", [day, side]);
    const b = await badgesFor("주식", ["코스피고수"]);
    expect(b["코스피고수"]).toBe("📈3연속");
  });
});
