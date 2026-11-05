import { describe, expect, it } from "vitest";
import { ANIME_SEASON, animeSeasonTitles, currentQuarter } from "@/lib/animeSeason";
import { boardOf } from "@/lib/roomBoards";

describe("이번 분기 신작 목록 (11/5)", () => {
  it("15~25개, 겹치지 않고, 별점판 제목 칸(30자)에 들어간다", () => {
    const t = ANIME_SEASON.titles;
    expect(t.length).toBeGreaterThanOrEqual(15);
    expect(t.length).toBeLessThanOrEqual(25);
    expect(new Set(t).size).toBe(t.length);
    for (const x of t) expect(x.length).toBeLessThanOrEqual(30);
    expect(ANIME_SEASON.season).toMatch(/^\d{4}-Q[1-4]$/);
  });
  it("분기는 KST 기준, 지난 분기 목록이면 칩을 숨긴다", () => {
    expect(currentQuarter(new Date("2026-09-30T15:00:00Z"))).toBe("2026-Q4"); // KST 10/1 0시
    expect(currentQuarter(new Date("2026-09-30T14:59:00Z"))).toBe("2026-Q3");
    expect(animeSeasonTitles(new Date("2026-11-05T03:00:00Z"))).toBe(ANIME_SEASON.titles);
    expect(animeSeasonTitles(new Date("2027-01-02T03:00:00Z"))).toEqual([]);
  });
  it("애니 별점판이 이 목록을 쓴다", () => {
    const b = boardOf("anime-stars");
    expect(b?.kind === "rating" && b.choices).toBe("anime-season");
  });
});
