import { describe, expect, it } from "vitest";
import { talkUrl } from "@/lib/repo/humanWrites";

describe("🙋 사람 글 바로가기 주소", () => {
  it("숨은 댓글 글은 사람이 보는 화면으로", () => {
    expect(talkUrl("roomchat:neo:4", "neo", "27808", "1206")).toBe("/neo/4#c1206");
    expect(talkUrl("roomchat:singles-ev:12", "미혼남녀-만남-행사", "500", "9")).toBe("/singles/12#c9");
    expect(talkUrl("roomchat:tennis:3", "tennis-talk", "600", "1")).toBe(`/c/${encodeURIComponent("테니스-덕후방")}?tab=games#game-3`);
    expect(talkUrl("roomchat:주식", "주식", "700", "5")).toBe(`/c/${encodeURIComponent("주식")}/chat#c5`);
    expect(talkUrl(null, "주식", "800", "6")).toBe("/posts/800#c6");
  });
});
