import { describe, expect, it } from "vitest";
import { headOf, parseHead, withHead } from "@/lib/heads";

describe("말머리 작은 방 (Sprint 86)", () => {
  it("reads, toggles and swaps the title prefix", () => {
    expect(headOf("[질문] 입문 키보드?")).toBe("질문");
    expect(headOf("[공지] 안내")).toBeUndefined();
    expect(parseHead("자랑")).toBe("자랑");
    expect(parseHead("x")).toBeUndefined();
    expect(withHead("입문 키보드?", "질문")).toBe("[질문] 입문 키보드?");
    expect(withHead("[질문] 입문 키보드?", "질문")).toBe("입문 키보드?");
    expect(withHead("[질문] 입문 키보드?", "후기")).toBe("[후기] 입문 키보드?");
  });
});
