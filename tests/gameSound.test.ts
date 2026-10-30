import { describe, expect, it } from "vitest";
import { noteHz, pourHz, soundOnFrom, stepSec, THEMES, themeNote } from "@/lib/gameSound";
import { VIBE } from "@/lib/juice";

describe("🔊 미니게임 소리 (10/30)", () => {
  it("끄기 기억: 'off' 일 때만 꺼짐, 처음엔 켜짐", () => {
    expect(soundOnFrom(null)).toBe(true);
    expect(soundOnFrom("on")).toBe(true);
    expect(soundOnFrom("off")).toBe(false);
  });
  it("음 높이: A4 440Hz, 한 옥타브 위는 두 배", () => {
    expect(noteHz(69)).toBe(440);
    expect(noteHz(81)).toBeCloseTo(880);
    expect(noteHz(60)).toBeCloseTo(261.63, 1);
  });
  it("배경 음악: 16분음표 길이와 마디마다 바뀌는 베이스", () => {
    expect(stepSec(120)).toBeCloseTo(0.125);
    const t = THEMES.pk!;
    expect(themeNote(t, 0)).toEqual({ lead: t.root, bass: t.root - 24 + t.bass[0]! });
    expect(themeNote(t, 1).bass).toBeNull();
    expect(themeNote(t, t.steps.length).bass).toBe(t.root - 24 + t.bass[1]!);
    expect(themeNote(t, t.steps.length * t.bass.length)).toEqual(themeNote(t, 0));
    // 쉼표는 소리 없음
    const rest = t.steps.indexOf(null);
    expect(themeNote(t, rest).lead).toBeNull();
  });
  it("게임마다 음악이 다르다", () => {
    const ids = ["reaction", "worldcup", "latte", "rally", "pk"];
    expect(Object.keys(THEMES).sort()).toEqual([...ids].sort());
    expect(new Set(ids.map((i) => `${THEMES[i]!.bpm}:${THEMES[i]!.root}`)).size).toBe(ids.length);
  });
  it("따르는 소리: 찰수록 높아지고 범위를 넘지 않는다", () => {
    expect(pourHz(0)).toBe(500);
    expect(pourHz(100)).toBe(2400);
    expect(pourHz(150)).toBe(2400);
    expect(pourHz(50)).toBeGreaterThan(pourHz(20));
  });
  it("진동: 큰 순간일수록 길다", () => {
    const sum = (p: number | readonly number[]) => (typeof p === "number" ? p : p.reduce((a, b) => a + b, 0));
    expect(sum(VIBE.tap)).toBeLessThan(sum(VIBE.hit));
    expect(sum(VIBE.hit)).toBeLessThan(sum(VIBE.big));
    expect(sum(VIBE.big)).toBeLessThan(sum(VIBE.win));
  });
});
