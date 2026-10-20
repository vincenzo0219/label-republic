import { describe, expect, it } from "vitest";
import { headOf, parseHead, withHead } from "@/lib/heads";

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
  });
});
