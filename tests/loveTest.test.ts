import { describe, expect, it } from "vitest";
import { loveBragLine, lovePick, LOVE_TYPES } from "@/lib/loveTest";

const all = (v: boolean) => ({ first: v, slow: v, talk: v, plan: v, reply: v, place: v, sure: v });

describe("💘 연애 성향 테스트", () => {
  it("먼저 연락·바로 고백이면 직진형", () => {
    expect(lovePick({ ...all(false), first: true, sure: true, reply: true }).key).toBe("direct");
  });
  it("천천히·기다림이면 천천히 스며드는 형", () => {
    expect(lovePick({ ...all(false), slow: true, talk: true, plan: true, place: true }).key).not.toBe("direct");
    expect(lovePick({ ...all(false), slow: true }).key).toBe("slow");
  });
  it("결과 줄은 타입 이름을 담는다", () => {
    expect(loveBragLine(LOVE_TYPES.talk!)).toContain("대화 우선형");
  });
});
