import { describe, expect, it } from "vitest";
import { BINGO_CELLS, bingoCandidates, bingoFilled, bingoLines } from "@/lib/singlesBingo";
import type { SinglesEvent } from "@/lib/singlesEvents";

const ev = (o: Partial<SinglesEvent>): SinglesEvent => ({
  id: "1", title: "행사", organizer: "시", organizerType: "gov", sido: "경기", sigungu: "군포시", venue: "",
  applyStart: "2026-10-01", applyEnd: "2026-11-08", eventDate: "2026-11-21", eventEnd: null,
  birthYearMin: null, birthYearMax: null, quotaMale: 15, quotaFemale: 15, regionBasis: "any", areas: [], areasMale: [], areasFemale: [],
  firstMarriageOnly: false, fee: null, selection: "", competitionNote: "", notes: "", originalUrl: "https://x", collectedAt: "2026-10-26", ...o,
});

// 🎯 행사 빙고 (10/28)
describe("행사 빙고", () => {
  const today = "2026-10-28";
  const a = ev({ id: "a" }); // 수도권 · 15명 · 접수 중
  const b = ev({ id: "b", sido: "경북", organizerType: "temple", eventDate: "2026-11-07", eventEnd: "2026-11-08", selection: "심사", fee: 0, quotaMale: 40, quotaFemale: 40, applyEnd: "2026-10-20" });
  it("본 행사의 조건으로만 칸이 채워지고, 가운데는 썸 시뮬레이터", () => {
    const keys = (f: boolean[]) => BINGO_CELLS.filter((_, i) => f[i]).map((c) => c.key);
    expect(keys(bingoFilled([a, b], new Set(), false, today))).toEqual([]);
    expect(keys(bingoFilled([a, b], new Set(["a"]), false, today))).toEqual(["capital", "small", "open"]);
    expect(keys(bingoFilled([a, b], new Set(["a", "b"]), true, today))).toEqual(["capital", "temple", "south", "overnight", "sim", "lottery", "small", "open", "free"]);
  });
  it("줄 세기 · 칸 후보는 접수 중 먼저", () => {
    expect(bingoLines([true, true, true, false, false, false, false, false, false])).toBe(1);
    expect(bingoLines([false, false, true, false, true, false, true, false, false])).toBe(1);
    expect(bingoLines(Array(9).fill(true))).toBe(8);
    const open = ev({ id: "o", sido: "경남" });
    expect(bingoCandidates(BINGO_CELLS[2]!, [b, open], today).map((e) => e.id)).toEqual(["o", "b"]);
  });
});
