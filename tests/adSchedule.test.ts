import { describe, expect, it } from "vitest";
import { ddayLabel, findDates, isAdLanding, kstDayNumber, latestEventTitles, scheduleLines, typeChip, type SchedulePost } from "@/lib/adSchedule";
import { ttlMemo } from "@/lib/ttlMemo";

// 2026-10-24(토) 21:00 KST = 12:00 UTC
const NOW = new Date("2026-10-24T12:00:00Z");
const REF = kstDayNumber(new Date("2026-10-22T01:00:00Z"));
const post = (id: string, title: string, body = "", created_at = "2026-10-22T01:00:00Z"): SchedulePost => ({ id, title, body, created_at });

describe("🎫 ad landing schedule (10/24)", () => {
  it("detects instagram ad landings only", () => {
    expect(isAdLanding("ig_ad")).toBe(true);
    expect(isAdLanding("ig_story")).toBe(true);
    expect(isAdLanding("IG_reels")).toBe(true);
    expect(isAdLanding("ig")).toBe(true);
    expect(isAdLanding(["ig_ad", "x"])).toBe(true);
    expect(isAdLanding(undefined)).toBe(false);
    expect(isAdLanding("")).toBe(false);
    expect(isAdLanding("kakao")).toBe(false);
    expect(isAdLanding("igloo")).toBe(false);
    expect(isAdLanding("big_ad")).toBe(false);
  });

  it("uses the KST calendar day", () => {
    // 10/24 23:30 KST 와 10/25 00:30 KST 는 다른 날, 10/24 09:30 KST 와 23:30 KST 는 같은 날
    const a = kstDayNumber(new Date("2026-10-24T14:30:00Z"));
    expect(kstDayNumber(new Date("2026-10-24T15:30:00Z"))).toBe(a + 1);
    expect(kstDayNumber(new Date("2026-10-24T00:30:00Z"))).toBe(a);
  });

  it("finds ranges, open-ended, deadline and weekday dates", () => {
    expect(findDates("대구마라톤 접수 10/26~11/1", REF).map((d) => d.when)).toEqual(["10/26~11/1"]);
    expect(findDates("접수 10/26(월)~11/1(일) 온라인", REF).map((d) => d.when)).toEqual(["10/26~11/1"]);
    expect(findDates("코믹월드 11/7(토)~8(일) 킨텍스", REF).map((d) => d.when)).toEqual(["11/7~11/8"]);
    expect(findDates("참가 신청 11/8 마감", REF).map((d) => d.when)).toEqual(["11/8 마감"]);
    expect(findDates("할인 ~10/31(토)까지", REF).map((d) => d.when)).toEqual(["~10/31"]);
    expect(findDates("가민 런 11/15(일) 고양", REF).map((d) => d.when)).toEqual(["11/15"]);
    expect(findDates("11월 15일 개최", REF).map((d) => d.when)).toEqual(["11/15"]);
    // 연말을 넘는 범위와 다음 해
    expect(findDates("12/28~1/3 겨울 팝업", REF).map((d) => d.when)).toEqual(["12/28~1/3"]);
  });

  it("ignores non-dates: 24/7, fractions in a chain, URLs, times", () => {
    expect(findDates("24/7 운영 · 10:30 시작", REF)).toEqual([]);
    expect(findDates("https://x.com/a/10/26 링크", REF)).toEqual([]);
    expect(findDates("1/2/3 단계", REF)).toEqual([]);
    expect(findDates("2/30 은 없는 날", REF)).toEqual([]);
  });

  it("sorts by the nearest upcoming day with D-n (ongoing → end day, past → dropped)", () => {
    const posts = [
      post("1", "[행사] 가민 런 코리아 11/15 · SKT 런메이트 캠프 ~11/1 (러닝 2곳)",
        "📍 2026 가민 런 코리아 · 11/15(일) 고양종합운동장 · 유료 https://discover.garmin.com/ko-KR/event/2026/garmin-run/\n📍 SKT 런메이트 캠프 · ~11/1(일) · 무료"),
      post("2", "[행사] 2027 대구마라톤 접수 (10/26~12/6)", "📍 2027 대구마라톤 10km 접수 · 10/26(월)~11/1(일) 온라인 · 11/2~8 결제"),
      post("3", "[행사] 강릉커피축제 (~10/25)", "📍 제18회 강릉커피축제 · 10/21(수)~10/25(일) 강릉커피거리"),
      post("4", "[행사] 지난 행사", "📍 지난 축제 · 10/10(토) 어딘가"),
    ];
    const lines = scheduleLines(posts, NOW);
    expect(lines).toEqual([
      { postId: "3", name: "제18회 강릉커피축제", when: "10/21~10/25", dday: 1 },
      { postId: "2", name: "2027 대구마라톤 10km 접수", when: "10/26~11/1", dday: 2 },
      { postId: "1", name: "SKT 런메이트 캠프", when: "~11/1", dday: 8 },
    ]);
    expect(lines.map((l) => ddayLabel(l.dday))).toEqual(["D-1", "D-2", "D-8"]);
    expect(ddayLabel(0)).toBe("D-day");
  });

  it("falls back to the title when the body has no event lines, and skips far-off dates", () => {
    const lines = scheduleLines([post("9", "[혜택] 원두 할인 (~10/31)", "자세한 건 링크"), post("8", "[행사] 먼 행사 3/5", "")], NOW);
    expect(lines).toEqual([{ postId: "9", name: "원두 할인", when: "~10/31", dday: 7 }]);
  });

  it("counts today's event as D-day in KST even late at night", () => {
    const late = new Date("2026-10-24T14:50:00Z"); // 23:50 KST
    expect(scheduleLines([post("5", "[행사] 오늘 밤 · 10/24(토)", "")], late)[0]!.dday).toBe(0);
    const next = new Date("2026-10-24T15:10:00Z"); // 00:10 KST 10/25 → 끝남
    expect(scheduleLines([post("5", "[행사] 오늘 밤 · 10/24(토)", "")], next)).toEqual([]);
  });

  it("returns the two latest [행사] titles when nothing is parseable", () => {
    const posts = [post("a", "[혜택] 쿠폰"), post("b", "[행사] 첫째 행사"), post("c", "[행사] 둘째 행사"), post("d", "[행사] 셋째 행사")];
    expect(scheduleLines(posts, NOW)).toEqual([]);
    expect(latestEventTitles(posts)).toEqual([{ postId: "b", name: "첫째 행사" }, { postId: "c", name: "둘째 행사" }]);
  });

  it("maps list chips from the title head", () => {
    expect(typeChip("[행사] 서울카페쇼", "chat")).toBe("🎫 행사");
    expect(typeChip("[혜택] 원두 할인", "chat")).toBe("🎁 혜택");
    expect(typeChip("[자랑] 완주 메달", "chat")).toBe("💬 잡담");
    expect(typeChip("그냥 수다", "chat")).toBe("💬 잡담");
    expect(typeChip("[행사] 정보 글", "info")).toBe("🎫 행사");
    expect(typeChip("마그네슘 비교", "info")).toBeNull();
  });
});

describe("ttlMemo (10/24 speed)", () => {
  it("reuses results within the TTL and retries after a failure", async () => {
    let calls = 0;
    const f = ttlMemo(async (k: number) => {
      calls++;
      if (k < 0) throw new Error("x");
      return k * 2;
    }, 60_000);
    expect(await f(2)).toBe(4);
    expect(await f(2)).toBe(4);
    expect(calls).toBe(1);
    await expect(f(-1)).rejects.toThrow();
    await expect(f(-1)).rejects.toThrow();
    expect(calls).toBe(3);
  });
});
