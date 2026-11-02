import { describe, expect, it } from "vitest";
import {
  avgOf, boardOf, boardsInRoom, chipSize, ingredientOfDay, INGREDIENTS, kstQuarterDay, kstWeekDay, logWindow, periodStreak, photoWeek, photoWeekEnds,
  photoWinner, prevPhotoWeek, quizAnswer, ratingBoard, ratingScoreOk, ROOM_BOARDS, topPercent, validMonthDay, WINE_NOTES, type LogBoard, type RatingBoard,
} from "@/lib/roomBoards";
import { logEntry, shortTextProblem } from "@/lib/roomBoardsCheck";
import { playItems, ROOM_PLAY } from "@/lib/roomPlay";

const kst = (s: string) => new Date(`${s}+09:00`);

describe("🧩 놀이판 설정", () => {
  it("every board is placed in its room's play tab, and every board item points at a real board", () => {
    const placed = new Set<string>();
    for (const [room, items] of Object.entries(ROOM_PLAY)) {
      for (const it of items) {
        if (it.kind !== "board") continue;
        const b = boardOf(it.key);
        expect(b, it.key).toBeDefined();
        expect(b!.room).toBe(room);
        placed.add(it.key);
      }
    }
    expect([...placed].sort()).toEqual(Object.keys(ROOM_BOARDS).sort());
  });

  it("covers the rooms asked for (A~F)", () => {
    const kinds = (room: string) => playItems(room).map((i) => (i.kind === "board" ? `${boardOf(i.key)!.kind}:${i.key}` : i.kind));
    expect(kinds("러닝-덕후방")).toContain("log:run-km");
    expect(kinds("읽는-책-제목을-교환해-보자")).toContain("log:book-pages");
    expect(kinds("적립식-투자방")).toContain("log:savings-done");
    expect(kinds("커피-덕후방")).toEqual(expect.arrayContaining(["log:coffee-cups", "vote:coffee-vote"]));
    expect(kinds("신발-덕후방")).toEqual(expect.arrayContaining(["photo:shoe-photo", "vote:shoe-vote"]));
    expect(kinds("오늘도-장사중")).toContain("vote:shop-vote");
    expect(kinds("비바리움-덕후방")).toContain("photo:viv-photo");
    expect(kinds("고양이-집사방")).toContain("photo:cat-photo");
    expect(kinds("비건-덕후방")).toContain("pick:vegan-quiz");
    expect(kinds("와인-위스키-덕후방")).toContain("pick:wine-note");
    expect(kinds("반려견-덕후방")).toContain("pet:dog-days");
    expect(kinds("보드게임-방탈출-덕후방")).toContain("rating:escape-log");
    expect(kinds("애니-만화-덕후방")).toContain("rating:anime-stars");
    expect(kinds("팝업-전시-덕후방")).toContain("going");
    expect(kinds("테니스-덕후방")).toContain("rank");
    expect(kinds("주식")).toContain("rank");
    expect(boardsInRoom("커피-덕후방").map((b) => b.key)).toEqual(["coffee-cups", "coffee-vote"]);
  });

  it("every card has a come-back line, polite copy, no em dash, and wine is 19+", () => {
    for (const b of Object.values(ROOM_BOARDS)) {
      expect(b.why.length, b.key).toBeGreaterThan(5);
      expect(JSON.stringify(b)).not.toContain("—");
    }
    expect(boardOf("wine-note")!.adult).toBe(true);
    expect(boardOf("nope")).toBeUndefined();
    expect(boardOf("toString")).toBeUndefined();
  });
});

describe("기간 (KST)", () => {
  it("weeks start Monday 00:00 KST, quarters and book month window", () => {
    expect(kstWeekDay(kst("2026-11-02T00:10:00"))).toBe("2026-11-02");
    expect(kstWeekDay(kst("2026-11-01T23:59:00"))).toBe("2026-10-26");
    expect(kstQuarterDay(kst("2026-11-02T10:00:00"))).toBe("2026-10-01");
    expect(kstQuarterDay(kst("2026-03-31T23:00:00"))).toBe("2026-01-01");
    const run = boardOf("run-km") as LogBoard;
    const book = boardOf("book-pages") as LogBoard;
    expect(logWindow(run, kst("2026-11-04T12:00:00"))).toEqual({ from: "2026-11-02", label: "이번 주" });
    expect(logWindow(book, kst("2026-11-04T12:00:00"))).toEqual({ from: "2026-11-01", label: "이번 달" });
  });

  it("photo weeks turn over on Friday 21:00 KST", () => {
    // 2026-11-06 은 금요일
    expect(photoWeek(kst("2026-11-06T20:59:00"))).toBe("2026-10-30");
    expect(photoWeek(kst("2026-11-06T21:00:00"))).toBe("2026-11-06");
    expect(photoWeek(kst("2026-11-12T23:00:00"))).toBe("2026-11-06");
    expect(prevPhotoWeek(kst("2026-11-06T21:00:00"))).toBe("2026-10-30");
    expect(photoWeekEnds(kst("2026-11-07T10:00:00")).toISOString()).toBe(kst("2026-11-13T21:00:00").toISOString());
  });

  it("streaks survive an empty today but break on a gap", () => {
    expect(periodStreak(["2026-11-02", "2026-11-01", "2026-10-31"], "2026-11-02", "day")).toBe(3);
    expect(periodStreak(["2026-11-01", "2026-10-31"], "2026-11-02", "day")).toBe(2);
    expect(periodStreak(["2026-11-02", "2026-10-31"], "2026-11-02", "day")).toBe(1);
    expect(periodStreak([], "2026-11-02", "day")).toBe(0);
    expect(periodStreak(["2026-11-01", "2026-10-01", "2026-09-01", "2026-07-01"], "2026-11-01", "month")).toBe(3);
    expect(periodStreak(["2026-01-01", "2025-12-01"], "2026-02-01", "month")).toBe(2);
  });
});

describe("작은 수 숨기기", () => {
  it("top percent needs 5 people, average 3", () => {
    expect(topPercent([1, 2, 3, 4], 4)).toBeNull();
    expect(topPercent([10, 8, 6, 4, 2], 10)).toBe(20);
    expect(topPercent([10, 8, 6, 4, 2], 6)).toBe(60);
    expect(topPercent([10, 8, 6, 4, 2], 2)).toBe(100);
    expect(topPercent([5, 5, 5, 5, 5], 5)).toBe(20);
    expect(topPercent([10, 8, 6, 4, 2], null)).toBeNull();
    expect(avgOf(10, 2)).toBeNull();
    expect(avgOf(10, 3)).toBe(3.3);
  });

  it("ratings show averages from 3, sorted by average", () => {
    const r = ratingBoard([
      { label: "가", n: 3, sum: 12, mine: null },
      { label: "나", n: 4, sum: 18, mine: 5 },
      { label: "다", n: 2, sum: 10, mine: null },
    ]);
    expect(r.shown.map((x) => [x.label, x.avg])).toEqual([["나", 4.5], ["가", 4]]);
    expect(r.waiting.map((x) => x.label)).toEqual(["다"]);
    const stars = boardOf("anime-stars") as RatingBoard;
    const result = boardOf("escape-log") as RatingBoard;
    expect([0, 1, 5, 6].map((s) => ratingScoreOk(stars, s))).toEqual([false, true, true, false]);
    expect([0, 1, 2].map((s) => ratingScoreOk(result, s))).toEqual([true, true, false]);
  });

  it("photo winner needs a heart, ties go to the earlier photo, hidden photos never win", () => {
    const t = (h: number) => new Date(Date.UTC(2026, 10, 1, h));
    expect(photoWinner([{ id: "1", hearts: 0, created_at: t(1) }])).toBeNull();
    expect(photoWinner([{ id: "1", hearts: 3, created_at: t(2) }, { id: "2", hearts: 3, created_at: t(1) }, { id: "3", hearts: 2, created_at: t(0) }])!.id).toBe("2");
    expect(photoWinner([{ id: "1", hearts: 9, created_at: t(1), is_hidden: true }, { id: "2", hearts: 1, created_at: t(2) }])!.id).toBe("2");
  });

  it("chip sizes scale 1~5", () => {
    expect(chipSize(0, 10)).toBe(1);
    expect(chipSize(10, 10)).toBe(5);
    expect(chipSize(3, 10)).toBe(2);
    expect(WINE_NOTES.length).toBeGreaterThanOrEqual(12);
  });
});

describe("🌱 성분 퀴즈", () => {
  it("has at least 30 ingredients with an explanation, both kinds, no duplicates", () => {
    expect(INGREDIENTS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(INGREDIENTS.map((i) => i.name)).size).toBe(INGREDIENTS.length);
    expect(INGREDIENTS.filter((i) => i.animal).length).toBeGreaterThanOrEqual(10);
    expect(INGREDIENTS.filter((i) => !i.animal).length).toBeGreaterThanOrEqual(10);
    for (const i of INGREDIENTS) expect(i.why.length).toBeGreaterThan(5);
  });

  it("rotates by date and visits every ingredient in one cycle", () => {
    const seen = new Set<string>();
    const start = Date.UTC(2026, 10, 2);
    for (let d = 0; d < INGREDIENTS.length; d++) seen.add(ingredientOfDay(new Date(start + d * 86_400_000).toISOString().slice(0, 10)).name);
    expect(seen.size).toBe(INGREDIENTS.length);
    expect(ingredientOfDay("2026-11-02")).toEqual(ingredientOfDay("2026-11-02"));
    expect(ingredientOfDay("2026-11-02").name).not.toBe(ingredientOfDay("2026-11-03").name);
    expect(quizAnswer("2026-11-02")).toBe(ingredientOfDay("2026-11-02").animal ? "동물성" : "동물성 아님");
  });
});

describe("입력 검사", () => {
  it("blocks contacts, links, abuse and stock talk in short text", () => {
    expect(shortTextProblem("레미제라블", "뮤지컬-연극-덕후방", 30)).toBeNull();
    expect(shortTextProblem("", "뮤지컬-연극-덕후방", 30)).toMatch(/적어/);
    expect(shortTextProblem("가".repeat(31), "뮤지컬-연극-덕후방", 30)).toMatch(/30자/);
    expect(shortTextProblem("010-1234-5678 연락", "신발-덕후방", 40)).toMatch(/연락처/);
    expect(shortTextProblem("카톡 주세요", "신발-덕후방", 40)).toMatch(/연락처/);
    expect(shortTextProblem("싸게 www.shoe.com", "신발-덕후방", 40)).toMatch(/링크/);
    expect(shortTextProblem("shoe.kr 최저가", "신발-덕후방", 40)).toMatch(/링크/);
    expect(shortTextProblem("병신", "신발-덕후방", 40)).toMatch(/욕설/);
  });

  it("checks log entries per input kind", () => {
    const run = boardOf("run-km") as LogBoard;
    expect(logEntry(run, { value: 5.23 })).toEqual({ label: "", value: 5.2 });
    expect(typeof logEntry(run, { value: 0 })).toBe("string");
    expect(typeof logEntry(run, { value: 101 })).toBe("string");
    expect(typeof logEntry(run, { value: Number.NaN })).toBe("string");
    const coffee = boardOf("coffee-cups") as LogBoard;
    expect(logEntry(coffee, { label: "라떼", value: 2 })).toEqual({ label: "라떼", value: 2 });
    expect(typeof logEntry(coffee, { label: "녹차", value: 1 })).toBe("string");
    expect(typeof logEntry(coffee, { label: "라떼", value: 6 })).toBe("string");
    expect(logEntry(boardOf("yoga-mat") as LogBoard, {})).toEqual({ label: "", value: 1 });
    expect(logEntry(boardOf("camping-region") as LogBoard, { label: "강원" })).toEqual({ label: "강원", value: 1 });
    expect(typeof logEntry(boardOf("camping-region") as LogBoard, { label: "도쿄" })).toBe("string");
    expect(logEntry(boardOf("stage-seen") as LogBoard, { label: "  레미제라블   25주년 " })).toEqual({ label: "레미제라블 25주년", value: 1 });
    expect(typeof logEntry(boardOf("stage-seen") as LogBoard, { label: "http://x.com" })).toBe("string");
  });

  it("pet dates: month/day only, Feb 29 allowed", () => {
    expect(validMonthDay(2, 29)).toBe(true);
    expect(validMonthDay(2, 30)).toBe(false);
    expect(validMonthDay(4, 31)).toBe(false);
    expect(validMonthDay(13, 1)).toBe(false);
    expect(validMonthDay(1, 0)).toBe(false);
  });
});
