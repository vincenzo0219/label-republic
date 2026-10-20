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
