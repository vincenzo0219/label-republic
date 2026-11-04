import { describe, expect, it } from "vitest";
import { withShare } from "@/lib/friendLink";
import { classifySource, SHARE_HOST } from "@/lib/metrics";
import { isSearchHeadTitle } from "@/lib/heads";

describe("🔗 공유 고리 (11/4)", () => {
  it("adds from=share once and keeps other params and hash", () => {
    expect(withShare("https://nobangjang.com/games/reaction")).toBe("https://nobangjang.com/games/reaction?from=share");
    expect(withShare("/fan-test?m=a&n=b")).toBe("/fan-test?m=a&n=b&from=share");
    expect(withShare("/t/x?vs=3#top")).toBe("/t/x?vs=3&from=share#top");
    expect(withShare("/ear-test?from=share")).toBe("/ear-test?from=share");
    expect(withShare("/c/a?tab=play&from=play")).toBe("/c/a?tab=play&from=play");
  });

  it("counts a from=share landing as the share source", () => {
    for (const from of ["share", "vs", "mate"]) expect(classifySource({ landing: true, referrer: null, siteHost: "nobangjang.com", from })).toEqual({ source: "social", host: SHARE_HOST });
  });

  it("treats [행사]·[정보]·[일본] titles as searchable", () => {
    expect(isSearchHeadTitle("[행사] 서울카페쇼")).toBe(true);
    expect(isSearchHeadTitle("[일본] 일본 애니 행사 한 장")).toBe(true);
    expect(isSearchHeadTitle("오늘 뭐 먹지")).toBe(false);
  });
});
