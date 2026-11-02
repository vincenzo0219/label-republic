import { describe, expect, it } from "vitest";
import { FAN_TYPES } from "@/lib/fanTest";
import {
  decodeFanMate,
  decodeLoveMate,
  decodeVs,
  encodeMate,
  encodeVs,
  FAN_COMPAT,
  fanCompat,
  friendCard,
  friendCardUrl,
  isFriendTest,
  LOVE_COMPAT,
  loveCompat,
  SAME_TEAM_BONUS,
  SCORE_TESTS,
  vsOutcome,
} from "@/lib/friendLink";
import { LOVE_TYPES } from "@/lib/loveTest";
import { K_LEAGUE_TEAMS } from "@/lib/peers";

const qOf = (url: string) => new URL(url).searchParams;

describe("점수 대결 링크", () => {
  it("encode → decode 가 되돌아온다", () => {
    const url = encodeVs("/ear-test", 7, "귀요미");
    expect(url).toBe("https://nobangjang.com/ear-test?vs=7&n=%EA%B7%80%EC%9A%94%EB%AF%B8&from=vs");
    expect(decodeVs(qOf(url), 0, 10)).toEqual({ score: 7, name: "귀요미" });
  });
  it("닉네임이 없으면 n 을 빼고, 읽을 때는 '친구'", () => {
    const url = encodeVs("/games/reaction", 231.6, "");
    expect(url).toBe("https://nobangjang.com/games/reaction?vs=232&from=vs");
    expect(decodeVs(qOf(url), 80, 2000)).toEqual({ score: 232, name: "친구" });
  });
  it("닉네임의 특수문자·긴 이름은 정리한다", () => {
    expect(decodeVs(new URLSearchParams("vs=3&n=<script>abcdefghijklmnop"), 0, 10)?.name).toBe("scriptabcdef");
  });
  it("범위 밖·숫자 아님·없음은 null", () => {
    expect(decodeVs(new URLSearchParams("vs=11"), 0, 10)).toBeNull();
    expect(decodeVs(new URLSearchParams("vs=-1"), 0, 10)).toBeNull();
    expect(decodeVs(new URLSearchParams("vs=3.5"), 0, 10)).toBeNull();
    expect(decodeVs(new URLSearchParams("vs=abc"), 0, 10)).toBeNull();
    expect(decodeVs(new URLSearchParams("vs="), 0, 10)).toBeNull();
    expect(decodeVs(new URLSearchParams("n=x"), 0, 10)).toBeNull();
    expect(decodeVs(new URLSearchParams("vs=79"), 80, 2000)).toBeNull();
  });
  it("승패: 반응속도는 작을수록 이긴다", () => {
    expect(vsOutcome(8, 7)).toBe(1);
    expect(vsOutcome(7, 7)).toBe(0);
    expect(vsOutcome(6, 7)).toBe(-1);
    expect(vsOutcome(200, 250, true)).toBe(1);
    expect(vsOutcome(300, 250, true)).toBe(-1);
  });
  it("보이는 점수", () => {
    expect(SCORE_TESTS.reaction.format(231)).toBe("0.231초");
    expect(SCORE_TESTS.ntrp.format(16)).toBe("NTRP 3.5");
    expect(SCORE_TESTS.ear.format(7)).toBe("10문제 중 7개");
  });
});

describe("궁합표", () => {
  const loveKeys = Object.keys(LOVE_TYPES);
  const fanKeys = Object.keys(FAN_TYPES);

  it("연애 성향: 모든 조합이 있고 순서와 상관없이 같다", () => {
    expect(Object.keys(LOVE_COMPAT)).toHaveLength((loveKeys.length * (loveKeys.length + 1)) / 2);
    for (const a of loveKeys)
      for (const b of loveKeys) {
        const c = loveCompat(a, b);
        expect(c).not.toBeNull();
        expect(c).toEqual(loveCompat(b, a));
        expect(c!.pct).toBeGreaterThanOrEqual(0);
        expect(c!.pct).toBeLessThanOrEqual(100);
        expect(c!.line).not.toMatch(/—/);
      }
    expect(loveCompat("slow", "talk")!.pct).toBe(88);
    expect(loveCompat("nope", "talk")).toBeNull();
  });

  it("팬 타입: 모든 조합, 같은 팀이면 +8 (99에서 멈춤)", () => {
    expect(Object.keys(FAN_COMPAT)).toHaveLength((fanKeys.length * (fanKeys.length + 1)) / 2);
    for (const a of fanKeys)
      for (const b of fanKeys) {
        const c = fanCompat(a, b);
        expect(c).not.toBeNull();
        expect(c!.pct).toBe(fanCompat(b, a)!.pct);
        expect(c!.line).not.toMatch(/—/);
      }
    expect(fanCompat("away", "analyst")).toMatchObject({ pct: 74, sameTeam: false, rival: false });
    expect(fanCompat("away", "analyst", "전북", "전북")).toMatchObject({ pct: 74 + SAME_TEAM_BONUS, sameTeam: true });
    expect(fanCompat("ultra", "ultra", "울산", "울산")!.pct).toBe(99);
    expect(fanCompat("away", "analyst", "전북", "울산")).toMatchObject({ pct: 74, rival: true });
    expect(fanCompat("away", "analyst", "전북", null)).toMatchObject({ pct: 74, rival: false });
  });
});

describe("궁합 링크", () => {
  it("연애 성향 encode → decode", () => {
    const url = encodeMate("/love-test", "talk", "봄");
    expect(url).toBe("https://nobangjang.com/love-test?m=talk&n=%EB%B4%84&from=mate");
    const m = decodeLoveMate(qOf(url));
    expect(m).toEqual({ type: LOVE_TYPES.talk, name: "봄", team: null });
  });
  it("팬 테스트는 아는 K리그 팀만 싣는다", () => {
    expect(K_LEAGUE_TEAMS).toContain("전북");
    const url = encodeMate("/fan-test", "away", "", "전북");
    expect(decodeFanMate(qOf(url))).toEqual({ type: FAN_TYPES.away, name: "친구", team: "전북" });
    expect(encodeMate("/fan-test", "away", "", "없는팀")).not.toContain("t=");
    expect(decodeFanMate(new URLSearchParams("m=away&t=없는팀"))?.team).toBeNull();
  });
  it("없는 타입·프로토타입 키는 null", () => {
    expect(decodeLoveMate(new URLSearchParams("m=zzz"))).toBeNull();
    expect(decodeLoveMate(new URLSearchParams("m=toString"))).toBeNull();
    expect(decodeFanMate(new URLSearchParams(""))).toBeNull();
  });
});

describe("링크 미리보기 카드", () => {
  it("대결 링크면 친구 기록, 아니면 null", () => {
    expect(friendCard("ear", { vs: "7", n: "귀요미" })).toMatchObject({ headline: "귀요미님 기록: 10문제 중 7개" });
    expect(friendCard("reaction", new URLSearchParams("vs=231"))).toMatchObject({ headline: "친구님 기록: 0.231초" });
    expect(friendCard("ear", {})).toBeNull();
    expect(friendCard("ear", { vs: "99" })).toBeNull();
  });
  it("궁합 링크면 친구 타입", () => {
    expect(friendCard("love", { m: "direct", n: "해" })!.headline).toBe("해님은 🔥 직진형");
    expect(friendCard("fan", { m: "sofa", t: "포항" })!.headline).toBe("친구님은 🛋 소파 응원단 (포항)");
    expect(friendCard("love", { m: "x" })).toBeNull();
  });
  it("카드 문구에 em dash 가 없다", () => {
    const cards = [friendCard("first-line", { vs: "3" }), friendCard("ntrp", { vs: "20" }), friendCard("love", { m: "plan" }), friendCard("fan", { m: "ultra" })];
    for (const c of cards) expect(JSON.stringify(c)).not.toMatch(/—/);
  });
  it("카드 이미지 주소는 대결·궁합 값만 넘긴다", () => {
    expect(friendCardUrl("fan", { m: "away", t: "전북", n: "a", from: "mate", x: "1" })).toBe("/api/card/friend?test=fan&n=a&m=away&t=%EC%A0%84%EB%B6%81");
  });
  it("테스트 키 검사", () => {
    expect(isFriendTest("love")).toBe(true);
    expect(isFriendTest("reaction")).toBe(true);
    expect(isFriendTest("constructor")).toBe(false);
    expect(isFriendTest(null)).toBe(false);
  });
});
