import { describe, expect, it } from "vitest";
import { findPeer, teamOf, typeLabel, typeOf } from "@/lib/peers";

describe("test result peers (Sprint 94)", () => {
  it("reads the team people wrote, in their own spelling", () => {
    expect(teamOf("⚽ 축구 팬 테스트: 🚌 원정 직관러 / 응원 팀: Fc서울")).toBe("FC서울");
    expect(teamOf("⚽ 축구 팬 테스트: 🚌 원정 직관러 / 응원 팀: 수원삼성블루윙즈/수원직관러")).toBe("수원삼성");
    expect(teamOf("⚽ 축구 팬 테스트: 📊 전술 분석가 / 응원 팀: 수원FC")).toBe("수원FC");
    expect(teamOf("⚽ 축구 팬 테스트: 🚌 원정 직관러 / 응원 팀: 울산 HD FC")).toBe("울산");
    expect(teamOf("⚽ 축구 팬 테스트: 🚌 원정 직관러 / 응원 팀: -")).toBeUndefined();
    expect(teamOf("🎧 황금귀 테스트 7/10 (👂 예민한 귀) / 장비: 해드폰")).toBeUndefined();
  });

  it("reads the type or score before the first slash", () => {
    expect(typeOf("🎧 황금귀 테스트 7/10 (👂 예민한 귀) / 장비: 해드폰")).toBe("🎧 황금귀 테스트 7/10 (👂 예민한 귀)");
    expect(typeLabel("⚽ 축구 팬 테스트: 🚌 원정 직관러")).toBe("🚌 원정 직관러");
    expect(typeOf("그냥 인사해요")).toBeUndefined();
  });

  it("prefers the same team, then the same type, never oneself", () => {
    const earlier = [
      { nickname: "인유", body: "⚽ 축구 팬 테스트: 🚌 원정 직관러 / 응원 팀: ㄱㅎ" },
      { nickname: "1983", body: "⚽ 축구 팬 테스트: 🚌 원정 직관러 / 응원 팀: FC서울" },
    ];
    expect(findPeer("⚽ 축구 팬 테스트: 📊 전술 분석가 / 응원 팀: FC 서울", "ynk", earlier)).toEqual({ nickname: "1983", why: "team", label: "FC서울" });
    expect(findPeer("⚽ 축구 팬 테스트: 🚌 원정 직관러 / 응원 팀: 강원FC", "또타", earlier)).toEqual({ nickname: "인유", why: "type", label: "🚌 원정 직관러" });
    expect(findPeer("⚽ 축구 팬 테스트: 🛋 소파 응원단 / 응원 팀: 제주", "x", earlier)).toBeNull();
    expect(findPeer("⚽ 축구 팬 테스트: 🚌 원정 직관러 / 응원 팀: FC서울", "1983", earlier.slice(1))).toBeNull();
  });
});

describe("KBO teams (10/21)", async () => {
  const { teamOf } = await import("@/lib/peers");
  const { baseballPick, baseballBragLine, BASEBALL_TYPES } = await import("@/lib/baseballTest");
  it("reads KBO clubs after 응원 구단: without mixing in K League names", () => {
    expect(teamOf(`${baseballBragLine(BASEBALL_TYPES.cheer!)}기아 타이거즈`)).toBe("KIA");
    expect(teamOf("⚾ 야구 팬 테스트: 🍗 야구장 먹방러 / 응원 구단: 대구 삼성")).toBe("삼성");
    expect(teamOf("⚾ 야구 팬 테스트: 📊 기록 분석가 / 응원 구단: kt wiz 수원")).toBe("KT");
    expect(teamOf("⚽ 축구 팬 테스트: 🚌 원정 직관러 / 응원 팀: 대구fc")).toBe("대구");
  });
  it("picks a type from the four answers", () => {
    expect(baseballPick({ stadium: true, cheer: true, analysis: false, goods: false }).key).toBe("cheer");
    expect(baseballPick({ stadium: true, cheer: false, analysis: true, goods: true }).key).toBe("food");
    expect(baseballPick({ stadium: false, cheer: false, analysis: true, goods: false }).key).toBe("analyst");
    expect(baseballPick({ stadium: false, cheer: false, analysis: false, goods: true }).key).toBe("collector");
    expect(baseballPick({ stadium: false, cheer: true, analysis: false, goods: false }).key).toBe("home");
  });
});

describe("runner test (10/21)", async () => {
  const { runnerPick } = await import("@/lib/runnerTest");
  it("picks a type from the four answers", () => {
    expect(runnerPick({ dawn: true, crew: false, record: true, race: true }).key).toBe("record");
    expect(runnerPick({ dawn: true, crew: true, record: false, race: true }).key).toBe("medal");
    expect(runnerPick({ dawn: true, crew: true, record: false, race: false }).key).toBe("crew");
    expect(runnerPick({ dawn: true, crew: false, record: false, race: false }).key).toBe("dawn");
    expect(runnerPick({ dawn: false, crew: false, record: false, race: false }).key).toBe("scenery");
  });
});

describe("yoga test (10/21)", async () => {
  const { yogaPick } = await import("@/lib/yogaTest");
  it("picks a type from the four answers", () => {
    expect(yogaPick({ sweat: true, group: true, morning: true, gear: true }).key).toBe("core");
    expect(yogaPick({ sweat: false, group: true, morning: false, gear: false }).key).toBe("mate");
    expect(yogaPick({ sweat: false, group: true, morning: false, gear: true }).key).toBe("gear");
    expect(yogaPick({ sweat: false, group: false, morning: true, gear: true }).key).toBe("morning");
    expect(yogaPick({ sweat: false, group: false, morning: false, gear: false }).key).toBe("heal");
  });
});

describe("shoe test (10/23)", async () => {
  const { shoePick } = await import("@/lib/shoeTest");
  const base = { halfUp: false, sneaker: true, wearOut: true, comfy: true, draw: false, box: false, clean: false };
  it("picks a type from the seven answers", () => {
    expect(shoePick(base).key).toBe("comfort");
    expect(shoePick({ ...base, draw: true, wearOut: false }).key).toBe("hunter");
    expect(shoePick({ ...base, box: true, clean: true }).key).toBe("collector");
    expect(shoePick({ ...base, sneaker: false, comfy: false, wearOut: false }).key).toBe("coordi");
    expect(shoePick({ ...base, halfUp: true }).key).toBe("comfort");
  });
});
