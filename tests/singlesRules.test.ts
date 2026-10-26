import { describe, expect, it } from "vitest";
import { ROOM_DEFAULT_TAB, roomTabOf, roomTabsAround } from "@/lib/heads";
import { SINGLES_TAB } from "@/lib/singlesEvents";
import { CONTACT_ERROR, SINGLES_RULE_NOTICE, contactProblem, roomRuleNotice } from "@/lib/singlesRules";

const ROOM = "미혼남녀-만남-행사";

describe("💌 만남 행사 방 연락처 규칙", () => {
  it("rejects phone numbers, kakao ids, open chat links, instagram, email and DM solicitations", () => {
    for (const t of [
      "010-1234-5678 로 연락 주세요",
      "01012345678",
      "0 1 0 1 2 3 4 5 6 7 8",
      "공일공 일이삼사 오육칠팔",
      "카톡 아이디 abc123 이에요",
      "카톡: abc123",
      "카톡 주세요",
      "ㅋㅌ 아이디 알려 주세요",
      "https://open.kakao.com/o/abcd 들어오세요",
      "오픈채팅방 만들었어요",
      "인스타 @minji.kim 팔로우해요",
      "인스타 아이디 남길게요",
      "instagram.com/minji",
      "insta: minji_k",
      "메일 minji@naver.com",
      "minji 골뱅이 naver 닷 com",
      "DM 주세요",
      "디엠 보낼게요",
      "번호 좀 주세요",
      "연락처 교환해요",
      "전화번호 알려 주실 분",
      "관심 있으면 연락 주세요",
      "갠톡 해요",
      "텔레그램 아이디 있어요",
    ])
      expect(contactProblem(ROOM, t), t).toBe(CONTACT_ERROR);
  });

  it("allows ordinary talk, mentions, dates, amounts and the original notice link", () => {
    for (const t of [
      "창원 행사 신청 마감이 11/3 이네요",
      "@민지 저도 신청했어요",
      "@minji 저도 추첨 기다려요",
      "참가비 30,000원이고 2024년 10월 26일 열려요",
      "원문 링크 https://example.go.kr/notice/1",
      "접수 마감 2025-11-03",
      "인스타에서 공지 봤어요",
      "아이디어 좋네요",
      "떨어졌어요 ㅠㅠ 다음 회차 노려 봐요",
      "주최 측에 문의해 보세요",
    ])
      expect(contactProblem(ROOM, t), t).toBeNull();
  });

  it("only applies to the singles room", () => {
    expect(contactProblem("러닝-덕후방", "카톡 아이디 abc123")).toBeNull();
    expect(contactProblem(null, "010-1234-5678")).toBeNull();
    expect(roomRuleNotice(ROOM)).toBe(SINGLES_RULE_NOTICE);
    expect(roomRuleNotice("러닝-덕후방")).toBeNull();
    expect(SINGLES_RULE_NOTICE).not.toContain("—");
    expect(CONTACT_ERROR).not.toContain("—");
  });

  it("the room opens on the 💌 만남 행사 tab, placed before 💬 채팅", () => {
    expect(ROOM_DEFAULT_TAB[ROOM]).toBe(SINGLES_TAB);
    expect(roomTabOf(ROOM, SINGLES_TAB)).toEqual({ key: "meet", label: "💌 만남 행사" });
    expect(roomTabsAround(ROOM).before.map((t) => t.key)).toEqual(["meet"]);
  });
});
