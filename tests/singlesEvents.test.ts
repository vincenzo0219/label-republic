import { describe, expect, it } from "vitest";
import {
  ALERT_CONSENT_TEXT,
  ORGANIZER_TYPES,
  SINGLES_NOTICE,
  SINGLES_ROOM_DESC,
  SINGLES_SCOPE_NOTE,
  STATUS_LABELS,
  VERDICT_LABELS,
  alertMatches,
  applyDdayLabel,
  checkEligibility,
  cleanProfile,
  closesTomorrow,
  eventStatus,
  nextAfterRejection,
  normalizeRegion,
  opensNow,
  periodLabel,
  placeIn,
  regionDistance,
  regionRuleLabel,
  sortForList,
  type SinglesEvent,
} from "@/lib/singlesEvents";

const TODAY = "2026-10-26";

const ev = (over: Partial<SinglesEvent> = {}): SinglesEvent => ({
  id: "1",
  title: "창원 미혼남녀 만남",
  organizer: "창원특례시",
  organizerType: "gov",
  sido: "경남",
  sigungu: "창원시",
  venue: "",
  applyStart: "2026-10-20",
  applyEnd: "2026-10-28",
  eventDate: "2026-11-14",
  eventEnd: null,
  birthYearMin: 1987,
  birthYearMax: 2000,
  quotaMale: 40,
  quotaFemale: 40,
  regionBasis: "live_or_work",
  areas: ["경남 창원시"],
  areasMale: [],
  areasFemale: [],
  firstMarriageOnly: false,
  fee: 0,
  selection: "추첨",
  competitionNote: "",
  notes: "",
  originalUrl: "https://example.go.kr/notice/1",
  collectedAt: "2026-10-25",
  ...over,
});

describe("💌 만남 행사 상태 · D-day", () => {
  it("derives status from apply and event dates", () => {
    expect(eventStatus(ev(), TODAY)).toBe("open");
    expect(eventStatus(ev({ applyStart: "2026-11-01", applyEnd: "2026-11-10" }), TODAY)).toBe("upcoming");
    expect(eventStatus(ev({ applyEnd: "2026-10-25" }), TODAY)).toBe("closed");
    expect(eventStatus(ev({ applyEnd: "2026-10-01", eventDate: "2026-10-10" }), TODAY)).toBe("ended");
    expect(eventStatus(ev({ applyStart: null, applyEnd: null, eventDate: null }), TODAY)).toBe("open");
  });

  it("labels D-day for the card", () => {
    expect(applyDdayLabel(ev(), TODAY)).toBe("마감 D-2");
    expect(applyDdayLabel(ev({ applyEnd: TODAY }), TODAY)).toBe("오늘 마감");
    expect(applyDdayLabel(ev({ applyStart: "2026-10-31", applyEnd: "2026-11-05" }), TODAY)).toBe("모집 D-5");
    expect(applyDdayLabel(ev({ applyEnd: "2026-10-25" }), TODAY)).toBe("모집 마감");
    expect(applyDdayLabel(ev({ applyEnd: null }), TODAY)).toBe("모집 중");
    expect(periodLabel("2026-10-20", "2026-10-28")).toBe("10/20(화) ~ 10/28(수)");
    expect(periodLabel(null, null)).toBe("원문 공지 확인");
  });

  it("sorts open (deadline first), then upcoming, then past", () => {
    const list = [
      ev({ id: "a", applyEnd: "2026-10-01", eventDate: "2026-10-05" }),
      ev({ id: "b", applyStart: "2026-11-02", applyEnd: "2026-11-09" }),
      ev({ id: "c", applyEnd: "2026-11-03" }),
      ev({ id: "d", applyEnd: "2026-10-27" }),
      ev({ id: "e", applyStart: "2026-10-30", applyEnd: "2026-11-09" }),
    ];
    expect(sortForList(list, TODAY).map((e) => e.id)).toEqual(["d", "c", "e", "b", "a"]);
  });
});

describe("💌 나 신청 가능?", () => {
  it("is 가능 when every given condition fits, with a positive reason", () => {
    const r = checkEligibility(ev(), { birthYear: 1992, gender: "female", live: "경남 창원시", firstMarriage: true }, TODAY);
    expect(r).toEqual({ verdict: "ok", reasons: ["입력한 조건이 모두 맞아요"] });
    expect(VERDICT_LABELS[r.verdict]).toBe("가능");
  });

  it("is 조건부 when something is unknown, 불가 with the reason when it does not fit", () => {
    expect(checkEligibility(ev(), {}, TODAY).verdict).toBe("maybe");
    const old = checkEligibility(ev(), { birthYear: 1985, live: "경남 창원시" }, TODAY);
    expect(old.verdict).toBe("no");
    expect(old.reasons).toContain("1987~2000년생만 신청할 수 있어요");
    const far = checkEligibility(ev(), { birthYear: 1992, live: "서울 마포구", work: "서울 중구" }, TODAY);
    expect(far).toMatchObject({ verdict: "no", reasons: ["경남 창원시에 살거나 직장이 있어야 해요"] });
  });

  it("asks for workplace proof when only the workplace is in the area", () => {
    const r = checkEligibility(ev(), { birthYear: 1992, live: "경남 김해시", work: "경남 창원시" }, TODAY);
    expect(r).toEqual({ verdict: "maybe", reasons: ["직장 소재지 증빙(재직증명 등)이 필요해요"] });
    // 시·도만 알면 조건부
    expect(checkEligibility(ev(), { birthYear: 1992, live: "경남" }, TODAY).verdict).toBe("maybe");
    // 거주만 보는 행사에 직장만 맞으면 불가
    expect(checkEligibility(ev({ regionBasis: "live" }), { birthYear: 1992, live: "경남 김해시", work: "경남 창원시" }, TODAY).verdict).toBe("no");
  });

  it("handles gender-specific region rules (의성 방식)", () => {
    const e = ev({ sido: "경북", sigungu: "의성군", areas: [], areasMale: ["경북 의성군"], areasFemale: ["대구", "경북"] });
    expect(regionRuleLabel(e)).toBe("거주 또는 직장: 남성 경북 의성군 / 여성 대구·경북");
    expect(checkEligibility(e, { birthYear: 1990, live: "대구 수성구" }, TODAY)).toMatchObject({ verdict: "maybe", reasons: ["성별에 따라 지역 요건이 달라요. 성별을 골라 주세요"] });
    expect(checkEligibility(e, { birthYear: 1990, gender: "female", live: "대구 수성구" }, TODAY).verdict).toBe("ok");
    expect(checkEligibility(e, { birthYear: 1990, gender: "male", live: "대구 수성구", work: "대구 중구" }, TODAY).verdict).toBe("no");
  });

  it("rejects under 19, closed recruitment, a closed gender quota and remarriage for 초혼-only", () => {
    expect(checkEligibility(ev({ birthYearMin: null, birthYearMax: null }), { birthYear: 2008, live: "경남 창원시" }, TODAY).reasons).toContain("만 19세 이상만 볼 수 있는 행사예요");
    // 만 19세가 되는 해(2007년생, 2026년)는 성인
    expect(checkEligibility(ev({ birthYearMin: null, birthYearMax: null }), { birthYear: 2007, live: "경남 창원시" }, TODAY).verdict).toBe("ok");
    expect(checkEligibility(ev({ applyEnd: "2026-10-25" }), { birthYear: 1992, live: "경남 창원시" }, TODAY).reasons).toContain("모집이 끝났어요");
    expect(checkEligibility(ev({ quotaMale: 0 }), { birthYear: 1992, gender: "male", live: "경남 창원시" }, TODAY).reasons).toContain("여성만 모집해요");
    expect(checkEligibility(ev({ firstMarriageOnly: true }), { birthYear: 1992, live: "경남 창원시", firstMarriage: false }, TODAY).verdict).toBe("no");
    expect(checkEligibility(ev({ firstMarriageOnly: true }), { birthYear: 1992, live: "경남 창원시" }, TODAY).verdict).toBe("maybe");
  });

  it("notes when recruitment has not started yet", () => {
    const r = checkEligibility(ev({ applyStart: "2026-11-01", applyEnd: "2026-11-10" }), { birthYear: 1992, live: "경남 창원시" }, TODAY);
    expect(r.verdict).toBe("ok");
    expect(r.reasons).toEqual(["모집은 11/1(일)부터"]);
  });

  it("cleans a stored profile (bad values dropped)", () => {
    expect(cleanProfile({ birthYear: 1992, gender: "female", live: "경남 창원시", work: "화성 어딘가", firstMarriage: true }, TODAY)).toEqual({
      birthYear: 1992, gender: "female", live: "경남 창원시", work: null, firstMarriage: true,
    });
    expect(cleanProfile("garbage", TODAY)).toEqual({ birthYear: null, gender: null, live: null, work: null, firstMarriage: null });
    expect(cleanProfile({ birthYear: 3000, gender: "x" }, TODAY)).toMatchObject({ birthYear: null, gender: null });
  });
});

describe("💌 지역", () => {
  it("matches places to areas", () => {
    expect(placeIn("경남 창원시", "경남")).toBe("yes");
    expect(placeIn("경남 창원시", "경남 창원시")).toBe("yes");
    expect(placeIn("경남", "경남 창원시")).toBe("partial");
    expect(placeIn("경남 김해시", "경남 창원시")).toBe("no");
    expect(placeIn("부산 중구", "경남")).toBe("no");
  });

  it("normalizes free-form regions for MCP", () => {
    expect(normalizeRegion("경남 창원시")).toBe("경남 창원시");
    expect(normalizeRegion("창원")).toBe("경남 창원시");
    expect(normalizeRegion("남양주시")).toBe("경기 남양주시");
    expect(normalizeRegion("경상남도")).toBe("경남");
    expect(normalizeRegion("서울")).toBe("서울");
    expect(normalizeRegion("경남 창원")).toBe("경남 창원시");
    expect(normalizeRegion("아틀란티스")).toBeNull();
  });

  it("orders distance: same 시군구, same 시도, then nearer 시도", () => {
    expect(regionDistance({ sido: "경남", sigungu: "창원시" }, { sido: "경남", sigungu: "창원시" })).toEqual([0, 0]);
    expect(regionDistance({ sido: "경남", sigungu: "창원시" }, { sido: "경남", sigungu: "김해시" })).toEqual([1, 0]);
    const busan = regionDistance({ sido: "경남", sigungu: "" }, { sido: "부산", sigungu: "" });
    const seoul = regionDistance({ sido: "경남", sigungu: "" }, { sido: "서울", sigungu: "" });
    expect(busan[0]).toBe(2);
    expect(busan[1]).toBeLessThan(seoul[1]);
  });
});

describe("💌 떨어졌어요 → 다음 행사", () => {
  const rejected = ev({ id: "r" });
  const any = { regionBasis: "any" as const, areas: [] };
  const list = [
    rejected,
    ev({ id: "seoul", sido: "서울", sigungu: "마포구", ...any }),
    ev({ id: "busan", sido: "부산", sigungu: "해운대구", ...any }),
    ev({ id: "gimhae", sido: "경남", sigungu: "김해시", ...any, applyEnd: "2026-11-05" }),
    ev({ id: "changwon2", sido: "경남", sigungu: "창원시", ...any, applyStart: "2026-11-01", applyEnd: "2026-11-12" }),
    ev({ id: "closed", sido: "경남", sigungu: "창원시", ...any, applyEnd: "2026-10-20" }),
    ev({ id: "tooOld", sido: "경남", sigungu: "창원시", ...any, birthYearMin: 1995 }),
  ];

  it("shows open and upcoming events, nearest first, skipping the rejected, closed and ineligible ones", () => {
    const next = nextAfterRejection(list, rejected, { birthYear: 1990 }, TODAY, 3);
    expect(next.map((e) => e.id)).toEqual(["changwon2", "gimhae", "busan"]);
  });

  it("uses my home region when I gave one", () => {
    const next = nextAfterRejection(list, rejected, { birthYear: 1990, live: "서울 마포구" }, TODAY, 2);
    expect(next.map((e) => e.id)).toEqual(["seoul", "changwon2"]);
  });
});

describe("💌 알림 대상", () => {
  it("matches by the criteria the user chose to send", () => {
    const e = ev();
    expect(alertMatches(e, { birthYear: null, gender: null, areas: [] }, TODAY)).toBe(true);
    expect(alertMatches(e, { birthYear: 1992, gender: "male", areas: ["경남"] }, TODAY)).toBe(true);
    expect(alertMatches(e, { birthYear: 1980, gender: null, areas: [] }, TODAY)).toBe(false);
    expect(alertMatches(e, { birthYear: null, gender: null, areas: ["서울"] }, TODAY)).toBe(false);
    expect(alertMatches(ev({ quotaFemale: 0 }), { birthYear: null, gender: "female", areas: [] }, TODAY)).toBe(false);
    // 지역 제한 없는 행사는 행사가 내 시·도에서 열리면
    expect(alertMatches(ev({ regionBasis: "any", areas: [], sido: "서울", sigungu: "종로구" }), { birthYear: null, gender: null, areas: ["서울 마포구"] }, TODAY)).toBe(true);
  });

  it("knows when recruitment opens (today or yesterday) and the day before the deadline", () => {
    expect(opensNow(ev({ applyStart: TODAY }), TODAY)).toBe(true);
    expect(opensNow(ev({ applyStart: "2026-10-25" }), TODAY)).toBe(true);
    expect(opensNow(ev({ applyStart: "2026-10-24" }), TODAY)).toBe(false);
    expect(closesTomorrow(ev({ applyEnd: "2026-10-27" }), TODAY)).toBe(true);
    expect(closesTomorrow(ev({ applyEnd: "2026-10-28" }), TODAY)).toBe(false);
  });
});

describe("💌 문구", () => {
  it("says what the owner required and never uses an em dash", () => {
    expect(SINGLES_ROOM_DESC).toBe("지자체·사찰·공공 만남 행사 모음. 만 19세 이상");
    expect(SINGLES_NOTICE).toContain("최종 기준은 원문 공지");
    expect(Object.values(ORGANIZER_TYPES)).toEqual(["지자체", "사찰", "공공", "민간 유료"]);
    const texts = [SINGLES_ROOM_DESC, SINGLES_NOTICE, SINGLES_SCOPE_NOTE, ALERT_CONSENT_TEXT, ...Object.values(STATUS_LABELS), ...Object.values(VERDICT_LABELS)];
    for (const t of texts) expect(t).not.toContain("—");
  });
});
