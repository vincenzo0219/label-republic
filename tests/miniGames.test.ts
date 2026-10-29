import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { better, formatScore, latteCupScore, latteHeart, roomGameLink, shareText, validScore, WORLDCUP_TRAITS } from "@/lib/miniGames";

describe("🎮 방 미니게임 (규칙)", () => {
  it("점수 범위: 반응속도 80ms 미만·정수 아님·범위 밖은 받지 않는다", () => {
    expect(validScore("reaction", 79)).toBe(false);
    expect(validScore("reaction", 80)).toBe(true);
    expect(validScore("reaction", 214.5)).toBe(false);
    expect(validScore("reaction", 2001)).toBe(false);
    expect(validScore("latte", 500)).toBe(true);
    expect(validScore("latte", 501)).toBe(false);
    expect(validScore("rally", -1)).toBe(false);
    expect(validScore("worldcup", 15)).toBe(true);
    expect(validScore("worldcup", 16)).toBe(false);
    expect(validScore("rally", "3")).toBe(false);
  });
  it("더 좋은 기록: 반응속도는 낮을수록, 나머지는 높을수록", () => {
    expect(better("reaction", 200, 250)).toBe(true);
    expect(better("reaction", 300, 250)).toBe(false);
    expect(better("rally", 12, 10)).toBe(true);
    expect(better("latte", 100, null)).toBe(true);
  });
  it("라떼 한 잔: 띠 안이면 70~100 + 하트, 넘치면 0", () => {
    expect(latteCupScore(70, 70)).toBe(100);
    expect(latteCupScore(75, 70)).toBe(70);
    expect(latteHeart(75, 70)).toBe(true);
    expect(latteCupScore(80, 70)).toBe(30);
    expect(latteHeart(80, 70)).toBe(false);
    expect(latteCupScore(100, 97)).toBe(0);
    expect(latteCupScore(20, 80)).toBe(0);
  });
  it("방 버튼과 표시 문구", () => {
    expect(roomGameLink("게임-덕후방")).toEqual({ href: "/games/reaction?from=room", label: "⚡ 반응속도 결투" });
    expect(roomGameLink("테니스-덕후방")?.label).toBe("🎾 랠리 탭");
    expect(roomGameLink("캠핑-덕후방")).toBeNull();
    expect(formatScore("reaction", 214)).toBe("0.214초");
    expect(shareText("rally", 12)).toBe("🎾 랠리 12번 이어 받기, 이길 수 있어?");
    expect(WORLDCUP_TRAITS).toHaveLength(16);
    expect(new Set(WORLDCUP_TRAITS).size).toBe(16);
    expect(WORLDCUP_TRAITS.join("")).not.toMatch(/—/);
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("🎮 방 미니게임 (DB)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
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

  const today = new Date("2026-11-02T03:00:00Z"); // 11/2 12:00 KST
  const yesterday = new Date("2026-11-01T03:00:00Z");

  it("반응속도: 내 최고는 가장 빠른 것, 오늘 최고는 오늘 것만", async () => {
    await g.recordPlay("reaction", "old", 150, yesterday);
    const a = await g.recordPlay("reaction", "a", 260, today);
    expect(a).toMatchObject({ myBest: 260, todayBest: 260, best: true });
    const b = await g.recordPlay("reaction", "a", 300, today);
    expect(b).toMatchObject({ myBest: 260, best: false });
    const c = await g.recordPlay("reaction", "b", 220, today);
    expect(c).toMatchObject({ myBest: 220, todayBest: 220, best: true });
    expect(await g.gameBoard("reaction", null, today)).toEqual({ myBest: null, todayBest: 220 });
  });
  it("랠리: 높을수록 좋다", async () => {
    await g.recordPlay("rally", "a", 5, today);
    const r = await g.recordPlay("rally", "a", 9, today);
    expect(r).toMatchObject({ myBest: 9, todayBest: 9, best: true });
    expect((await g.recordPlay("rally", "a", 3, today)).best).toBe(false);
  });
  it("월드컵: 같은 카드가 우승한 비율", async () => {
    await g.recordPlay("worldcup", "a", 2, today);
    await g.recordPlay("worldcup", "b", 2, today);
    await g.recordPlay("worldcup", "c", 5, today);
    const r = await g.recordPlay("worldcup", "d", 2, today);
    expect(r.worldcup).toEqual({ total: 4, same: 3, pct: 75 });
    expect(r.best).toBe(false);
  });
  it("관리자: 방 버튼 클릭·판·사람·2일 이상", async () => {
    await g.recordOpen("reaction", "a", "room", today);
    await g.recordOpen("reaction", "x", "direct", today);
    const stats = await g.gameStats(7, today);
    const rx = stats.find((s) => s.game === "reaction")!;
    expect(rx.days[0]).toEqual({ day: "2026-11-02", clicks: 1, opens: 2, plays: 3, players: 2 });
    expect(rx.players).toBe(3);
    expect(rx.returning).toBe(0);
    await g.recordPlay("reaction", "b", 400, yesterday);
    expect((await g.gameStats(7, today)).find((s) => s.game === "reaction")!.returning).toBe(1);
  });
});
