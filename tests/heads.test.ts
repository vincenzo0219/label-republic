import { describe, expect, it } from "vitest";
import { headOf, headsFor, parseHead, tabHeadsFor, tabMembers, withHead } from "@/lib/heads";

describe("말머리 작은 방 (Sprint 86)", () => {
  it("reads, toggles and swaps the title prefix", () => {
    expect(headOf("[자랑] 첫 키보드")).toBe("자랑");
    expect(headOf("[공지] 안내")).toBeUndefined();
    expect(parseHead("자랑")).toBe("자랑");
    expect(parseHead("x")).toBeUndefined();
    expect(withHead("첫 키보드", "자랑")).toBe("[자랑] 첫 키보드");
    expect(withHead("[자랑] 첫 키보드", "자랑")).toBe("첫 키보드");
    expect(withHead("[자랑] 첫 키보드", "행사")).toBe("[행사] 첫 키보드");
    // 질문 탭은 자유채팅으로 바뀌어 더 이상 말머리가 아니다
    expect(headOf("[질문] 사료?")).toBeUndefined();
    expect(headOf("[후기] 산책")).toBeUndefined();
    // 책 덕후방 전용 말머리 (4글자까지)
    expect(headOf("[같이읽기] 11월 책")).toBe("같이읽기");
    expect(withHead("[같이읽기] 11월 책", "밑줄")).toBe("[밑줄] 11월 책");
    expect(headsFor("읽는-책-제목을-교환해-보자").map((h) => h.key)).toEqual(["같이읽기", "밑줄", "추천", "행사", "혜택"]);
    expect(headsFor("k리그-덕후방").map((h) => h.key)).toEqual(["자랑", "행사", "혜택"]);
    // 💌 미혼남녀 방 (10/27): 행사·자랑 대신 신청 꿀팁·후기 질문, 정보 탭은 신청 꿀팁으로
    expect(headsFor("미혼남녀-만남-행사").map((h) => h.key)).toEqual(["꿀팁"]);
    expect(headOf("[참가후기] 김천 행사 다녀왔어요")).toBe("참가후기");
  });
  it("행사 탭에 핫딜·할인(혜택) 글을 합친다 (10/23)", () => {
    expect(tabHeadsFor("k리그-덕후방")).toEqual([
      { key: "자랑", label: "📸 자랑" },
      { key: "행사", label: "🎫 행사·할인" },
    ]);
    expect(tabHeadsFor("읽는-책-제목을-교환해-보자").map((h) => h.key)).toEqual(["같이읽기", "밑줄", "추천", "행사"]);
    expect(tabMembers("행사")).toEqual(["행사", "혜택"]);
    expect(tabMembers("자랑")).toEqual(["자랑"]);
    // 글쓰기에서는 혜택 말머리를 그대로 고를 수 있다
    expect(headsFor("k리그-덕후방").map((h) => h.key)).toContain("혜택");
  });
});
