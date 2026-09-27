import { describe, expect, it } from "vitest";
import { hashPin, verifyPin } from "@/lib/password";
import { highlight, searchTerms, snippet } from "@/lib/highlight";
import { slugify } from "@/lib/slug";
import { hit, resetRateLimits } from "@/lib/rate-limit";
import { extractiveSummary, resolveSummary, signSummary, verifySummaryToken, type SummaryLines } from "@/lib/summary";
import { createPostSchema, sortSchema } from "@/lib/validation";
import { combine, heuristicSpam, shouldSuppress } from "@/lib/moderation";

describe("password", () => {
  it("hashes with a random salt and verifies", async () => {
    const a = await hashPin("1234");
    const b = await hashPin("1234");
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$")).toBe(true);
    expect(await verifyPin("1234", a)).toBe(true);
    expect(await verifyPin("1235", a)).toBe(false);
    expect(await verifyPin("1234", "garbage")).toBe(false);
  });
});

describe("highlight", () => {
  it("splits text into matching segments case-insensitively", () => {
    expect(highlight("Omega3 오메가3 OMEGA3", ["omega3"])).toEqual([
      { text: "Omega3", match: true },
      { text: " 오메가3 ", match: false },
      { text: "OMEGA3", match: true },
    ]);
  });
  it("escapes regex metacharacters", () => {
    expect(highlight("a+b (c)", ["(c)"])).toEqual([
      { text: "a+b ", match: false },
      { text: "(c)", match: true },
    ]);
  });
  it("dedupes and caps search terms", () => {
    expect(searchTerms("  a b a c d e f g ")).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("builds a snippet around the first match", () => {
    const text = "가".repeat(100) + "마그네슘" + "나".repeat(100);
    const s = snippet(text, ["마그네슘"], 10);
    expect(s).toContain("마그네슘");
    expect(s.startsWith("…")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
  });
});

describe("slugify", () => {
  it("keeps Korean letters and collapses separators", () => {
    expect(slugify("커피 원두 & 로스팅!")).toBe("커피-원두-로스팅");
    expect(slugify("Mechanical Keyboard")).toBe("mechanical-keyboard");
  });
});

describe("rate limit", () => {
  it("allows up to the limit within the window", async () => {
    await resetRateLimits();
    expect(await hit("k", 2, 1000, 0)).toBe(true);
    expect(await hit("k", 2, 1000, 10)).toBe(true);
    expect(await hit("k", 2, 1000, 20)).toBe(false);
    expect(await hit("k", 2, 1000, 1500)).toBe(true);
  });
});

describe("summary", () => {
  it("extracts three fact-heavy lines in original order", () => {
    const body = [
      "안녕하세요 오늘은 후기입니다.",
      "마그네슘 비스글리시네이트 200mg 함유.",
      "그냥 그랬어요.",
      "부형제로 스테아린산마그네슘을 사용합니다.",
      "가격은 30% 비쌉니다.",
    ].join("\n");
    const lines = extractiveSummary("마그네슘", body);
    expect(lines).toHaveLength(3);
    expect(lines).toEqual([
      "마그네슘 비스글리시네이트 200mg 함유.",
      "부형제로 스테아린산마그네슘을 사용합니다.",
      "가격은 30% 비쌉니다.",
    ]);
  });

  it("always returns three lines for short bodies", () => {
    const lines = extractiveSummary("제목", "짧은 본문 하나뿐입니다");
    expect(lines).toHaveLength(3);
    lines.forEach((l) => expect(l.length).toBeGreaterThan(0));
  });

  it("signs and verifies preview tokens, rejecting tampering and expiry", () => {
    const s = { lines: ["a1", "b2", "c3"] as SummaryLines, model: "claude-opus-5" };
    const token = signSummary(s, 1000);
    expect(verifySummaryToken(token, 2000)).toEqual(s);
    expect(verifySummaryToken(token.slice(0, -2) + "xx", 2000)).toBeNull();
    expect(verifySummaryToken(token, 1000 + 25 * 3600 * 1000)).toBeNull();
  });

  it("detects author edits against the signed AI original", () => {
    const original = { lines: ["첫째 줄", "둘째 줄", "셋째 줄"] as SummaryLines, model: "claude-opus-5" };
    const token = signSummary(original);
    expect(resolveSummary(original.lines, token)).toMatchObject({ model: "claude-opus-5", isAuthorEdited: false });
    expect(resolveSummary(["첫째 줄", "둘째 줄", "고침"], token)).toMatchObject({ model: "claude-opus-5", isAuthorEdited: true });
    expect(resolveSummary(original.lines, undefined)).toMatchObject({ model: "author", isAuthorEdited: true });
    expect(resolveSummary(undefined, undefined)).toBeNull();
  });
});

describe("validation", () => {
  it("requires a 4-digit numeric pin", () => {
    const base = { category: "supplements", postType: "info", nickname: "닉네임", title: "제목입니다", body: "본문은 열 글자 이상입니다." };
    expect(createPostSchema.safeParse({ ...base, pw: "1234" }).success).toBe(true);
    expect(createPostSchema.safeParse({ ...base, pw: "123" }).success).toBe(false);
    expect(createPostSchema.safeParse({ ...base, pw: "12a4" }).success).toBe(false);
  });
  it("falls back to trust sort", () => {
    expect(sortSchema.parse("votes")).toBe("votes");
    expect(sortSchema.parse("nope")).toBe("trust");
    expect(sortSchema.parse(undefined)).toBe("trust");
  });
});

describe("moderation heuristics", () => {
  it("leaves factual reviews alone, even with a spec link and prices", () => {
    const v = heuristicSpam(
      "저소음 적축 측정",
      "입력압 45gf, 38dB 측정. 제조사 스펙: https://example.com/spec 가격은 2만원대입니다.",
    );
    expect(v.score).toBeLessThan(0.3);
    expect(shouldSuppress(v)).toBe(false);
  });

  it("flags messenger/phone/promo spam", () => {
    const v = heuristicSpam("최저가 공구", "카톡 아이디 abc 로 문의주세요 010-1234-5678 https://bit.ly/x");
    expect(shouldSuppress(v)).toBe(true);
    expect(v.reasons).toEqual(expect.arrayContaining(["메신저 유도", "전화번호", "판촉 문구", "단축/제휴 링크"]));
  });

  it("caps link scores so a well-sourced post is not suppressed by links alone", () => {
    const links = Array.from({ length: 10 }, (_, i) => `https://docs.example.com/${i}`).join("\n");
    expect(shouldSuppress(heuristicSpam("출처 모음", links))).toBe(false);
  });

  it("lets the AI verdict override heuristic false positives", () => {
    const h = { score: 1, reasons: ["전화번호"], model: "heuristic-v1" };
    expect(shouldSuppress(combine(h, { score: 0.05, reasons: ["정상 후기"], model: "m" }))).toBe(false);
    expect(shouldSuppress(combine({ ...h, score: 0.3 }, { score: 0.98, reasons: ["광고"], model: "m" }))).toBe(true);
    expect(combine(h, null)).toBe(h);
  });
});
