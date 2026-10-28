import { describe, expect, it } from "vitest";
import { NTRP_BANDS, NTRP_QUESTIONS, ntrpBand, ntrpScore } from "@/lib/ntrpTest";

describe("NTRP 자가진단", () => {
  it("모든 문항 보기는 4개, 점수 1~4", () => {
    for (const q of NTRP_QUESTIONS) expect(q.options.map((o) => o.score)).toEqual([1, 2, 3, 4]);
  });
  it("점수 범위와 잘못된 입력", () => {
    expect(ntrpScore(NTRP_QUESTIONS.map(() => 0))).toBe(6);
    expect(ntrpScore(NTRP_QUESTIONS.map(() => 3))).toBe(24);
    expect(ntrpScore([0])).toBeNull();
    expect(ntrpScore(NTRP_QUESTIONS.map(() => 4))).toBeNull();
  });
  it("구간: 최저는 입문, 최고는 4.5+, 경계값", () => {
    expect(ntrpBand(6).level).toBe("1.5~2.0");
    expect(ntrpBand(24).level).toBe("4.5+");
    expect(ntrpBand(15).level).toBe("3.5");
    expect(ntrpBand(14).level).toBe("3.0");
    expect(NTRP_BANDS.map((b) => b.min)).toEqual([...NTRP_BANDS.map((b) => b.min)].sort((a, b) => b - a));
  });
});
