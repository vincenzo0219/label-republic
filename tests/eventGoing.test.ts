import { describe, expect, it } from "vitest";
import {
  buildAutoGroups, chatOpen, checkinWindow, eventCardData, freeCancelUntil, goingDisplay, groupClosed, groupsProof, inCheckin, keepBadge,
  kstAt, meetTime, parseOpening, penaltyText, penaltyUntil, placeLine, planGroupSizes, poolDue, poolOpen, quietHours, reminderDue,
  settleOutcomes, spreadPlace, firstOfficialUrl, type PoolEntry,
} from "@/lib/eventGoing";
import { cleanChat } from "@/lib/eventChat";
import { FALLBACK_POINT, VENUES, distanceM, matchVenue, naverMapUrl } from "@/lib/venues";
import { eventSpan, kstDayNumber } from "@/lib/adSchedule";
import { classifySource, SHARE_HOST } from "@/lib/metrics";
import { poolSchema } from "@/lib/validation";

const DAY = 86_400_000;

describe("🙋 갈 거예요 표시 (3명부터)", () => {
  it("hides counts under 3 and caps public names at 10 with 외 n명", () => {
    expect(goingDisplay(0, [])).toBeNull();
    expect(goingDisplay(2, ["a", "b"])).toBeNull();
    expect(goingDisplay(3, [])).toEqual({ label: "같이 갈 사람 3명", names: [], more: 0 });
    const names = Array.from({ length: 12 }, (_, i) => `n${i}`);
    const d = goingDisplay(20, names)!;
    expect(d.names).toHaveLength(10);
    expect(d.more).toBe(10);
  });
  it("shows auto group social proof only from 3 groups", () => {
    expect(groupsProof(2)).toBeNull();
    expect(groupsProof(3)).toBe("이번 행사 조 3개 편성됨");
  });
});

describe("🙌 자동 조 편성", () => {
  it("makes balanced groups of 4 to 6 and leaves the rest unmatched", () => {
    expect(planGroupSizes(3)).toEqual({ sizes: [], leftover: 3 });
    expect(planGroupSizes(4)).toEqual({ sizes: [4], leftover: 0 });
    expect(planGroupSizes(6)).toEqual({ sizes: [6], leftover: 0 });
    expect(planGroupSizes(7)).toEqual({ sizes: [6], leftover: 1 });
    expect(planGroupSizes(8)).toEqual({ sizes: [4, 4], leftover: 0 });
    expect(planGroupSizes(11)).toEqual({ sizes: [6, 5], leftover: 0 });
    expect(planGroupSizes(13)).toEqual({ sizes: [5, 4, 4], leftover: 0 });
    for (let n = 0; n <= 60; n++) {
      const p = planGroupSizes(n);
      expect(p.sizes.every((s) => s >= 4 && s <= 6)).toBe(true);
      expect(p.sizes.reduce((a, b) => a + b, 0) + p.leftover).toBe(n);
      expect(p.leftover < 4 || p.sizes.length === 0 || n < 4).toBe(true);
      if (p.sizes.length) expect(Math.max(...p.sizes) - Math.min(...p.sizes)).toBeLessThanOrEqual(1);
    }
  });
  it("never mixes adults and teens, nor dates or slots, and leaves the latest sign-ups", () => {
    const e = (id: number, age: "adult" | "teen", slot: "am" | "pm" = "am", day = "2026-11-05"): PoolEntry => ({ id: String(id), day, slot, age, created_at: new Date(2026, 9, 1, 0, id) });
    const entries = [...[1, 2, 3, 4, 5].map((i) => e(i, "adult")), ...[6, 7, 8].map((i) => e(i, "teen")), e(9, "adult", "pm"), e(10, "adult")];
    const r = buildAutoGroups(entries);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0]).toMatchObject({ age: "adult", slot: "am" });
    expect(r.groups[0]!.ids).toEqual(["1", "2", "3", "4", "5", "10"]);
    expect(r.unmatched.sort()).toEqual(["6", "7", "8", "9"]);
    const seven = buildAutoGroups([1, 2, 3, 4, 5, 6, 7].map((i) => e(i, "teen")));
    expect(seven.groups[0]!.ids).toHaveLength(6);
    expect(seven.unmatched).toEqual(["7"]);
  });
});

describe("🧭 만날 곳·시각", () => {
  it("matches venues from the 📍 line, title, then body; longer aliases first", () => {
    expect(matchVenue("[행사] 서울레코드페어", "📍 코엑스 B홀 · 10시 오픈")!.key).toBe("coex");
    expect(matchVenue("[행사] 일러스타 페스 @ 킨텍스 제2전시장")!.key).toBe("kintex2");
    expect(matchVenue("[행사] 카페쇼", "장소: KINTEX 1전시장")!.key).toBe("kintex1");
    expect(matchVenue("[행사] 커피 엑스포", "양재 aT센터 제1전시장")!.key).toBe("at");
    expect(matchVenue("[행사] 지스타", "벡스코")!.key).toBe("bexco1");
    expect(matchVenue("[행사] 동네 플리마켓", "📍 망원 한강공원")).toBeNull();
  });
  it("falls back to the official entrance when the venue is unknown", () => {
    expect(spreadPlace(null, "09:40", 0)).toEqual({ point: FALLBACK_POINT, time: "09:40" });
    expect(spreadPlace(null, "09:40", 2).time).toBe("10:00");
  });
  it("meets 20 minutes before an am opening, else 09:40 / 13:40", () => {
    expect(parseOpening("📍 코엑스 · 10:00 오픈")).toBe(600);
    expect(parseOpening("오전 11시 개장")).toBe(660);
    expect(parseOpening("10시부터 입장")).toBe(600);
    expect(parseOpening("주차 2시간 무료")).toBeNull();
    expect(meetTime("am", 600)).toBe("09:40");
    expect(meetTime("am", 660)).toBe("10:40");
    expect(meetTime("am", null)).toBe("09:40");
    expect(meetTime("am", 14 * 60)).toBe("09:40");
    expect(meetTime("pm", 600)).toBe("13:40");
  });
  it("spreads groups of one slot over meeting points round-robin, then staggers by 10 minutes", () => {
    const coex = VENUES.find((v) => v.key === "coex")!;
    const a = [0, 1, 2, 3].map((i) => spreadPlace(coex, "09:40", i));
    expect(a[0]!.point.name).not.toBe(a[1]!.point.name);
    expect(a[2]!.point.name).toBe(a[0]!.point.name);
    expect(a.map((x) => x.time)).toEqual(["09:40", "09:40", "09:50", "09:50"]);
    expect(placeLine({ seq: 3, place: a[0]!.point.name, meet_time: "09:40", station: "삼성역" })).toBe("3조 · 삼성역 5·6번 출구 코엑스 연결통로 입구 · 09:40 · 삼성역");
    expect(naverMapUrl("코엑스 동문")).toBe("https://map.naver.com/p/search/%EC%BD%94%EC%97%91%EC%8A%A4%20%EB%8F%99%EB%AC%B8");
  });
  it("computes distances for the 500 m check", () => {
    expect(distanceM(37.5118, 127.0592, 37.5118, 127.0592)).toBe(0);
    expect(distanceM(37.5118, 127.0592, 37.5148, 127.0592)).toBeGreaterThan(300);
    expect(distanceM(37.5118, 127.0592, 37.5218, 127.0592)).toBeGreaterThan(1000);
  });
});

describe("⏱ 창 (KST)", () => {
  it("free cancel until D-1 18:00, chat opens D-1 00:00 for auto groups only", () => {
    expect(freeCancelUntil("2026-11-05").toISOString()).toBe("2026-11-04T09:00:00.000Z");
    expect(chatOpen({ kind: "auto", day: "2026-11-05" }, new Date("2026-11-03T14:59:00Z"))).toBe(false);
    expect(chatOpen({ kind: "auto", day: "2026-11-05" }, new Date("2026-11-03T15:00:00Z"))).toBe(true);
    expect(chatOpen({ kind: "open", day: "2026-11-05" }, new Date("2026-10-01T00:00:00Z"))).toBe(true);
  });
  it("check-in opens 30 minutes before and closes 30 minutes after the meeting time", () => {
    const w = checkinWindow("2026-11-05", "09:40");
    expect(w.from.toISOString()).toBe("2026-11-05T00:10:00.000Z");
    expect(w.to.toISOString()).toBe("2026-11-05T01:10:00.000Z");
    expect(inCheckin("2026-11-05", "09:40", new Date("2026-11-05T00:09:00Z"))).toBe(false);
    expect(inCheckin("2026-11-05", "09:40", new Date("2026-11-05T00:40:00Z"))).toBe(true);
    expect(inCheckin("2026-11-05", "09:40", new Date("2026-11-05T01:11:00Z"))).toBe(false);
  });
  it("opens pool sign-up until D-3 12:00 and groups from then; reminders at D-3 19~22h; quiet hours 22~08", () => {
    const start = kstDayNumber(kstAt("2026-11-05"));
    expect(poolOpen(start, kstAt("2026-11-02", "11:59"))).toBe(true);
    expect(poolOpen(start, kstAt("2026-11-02", "12:00"))).toBe(false);
    expect(poolDue(start, kstAt("2026-11-02", "11:59"))).toBe(false);
    expect(poolDue(start, kstAt("2026-11-02", "12:00"))).toBe(true);
    expect(poolDue(start, kstAt("2026-11-04", "09:00"))).toBe(true);
    expect(poolDue(start, kstAt("2026-11-06", "09:00"))).toBe(false);
    expect(reminderDue(start, kstAt("2026-11-02", "18:59"))).toBe(false);
    expect(reminderDue(start, kstAt("2026-11-02", "19:00"))).toBe(true);
    expect(reminderDue(start, kstAt("2026-11-02", "22:00"))).toBe(false);
    expect(reminderDue(start, kstAt("2026-11-01", "19:30"))).toBe(false);
    expect(quietHours(kstAt("2026-11-02", "22:30"))).toBe(true);
    expect(quietHours(kstAt("2026-11-02", "07:59"))).toBe(true);
    expect(quietHours(kstAt("2026-11-02", "08:00"))).toBe(false);
  });
  it("closes a 모집 when full or when its day has passed", () => {
    const now = kstAt("2026-11-05", "12:00");
    expect(groupClosed({ member_count: 4, capacity: 4, day: "2026-11-06" }, now)).toBe(true);
    expect(groupClosed({ member_count: 2, capacity: 4, day: "2026-11-04" }, now)).toBe(true);
    expect(groupClosed({ member_count: 2, capacity: 4, day: "2026-11-05" }, now)).toBe(false);
  });
});

describe("🤝 도착·노쇼", () => {
  const m = (id: string, o: Partial<{ left_at: string | null; late_cancel: boolean; checked_in: boolean; geo_ok: boolean; confirms: number }> = {}) => ({
    id, left_at: null, late_cancel: false, checked_in: false, geo_ok: false, confirms: 0, ...o,
  });
  it("attends with self check-in within 500 m, or with one member's confirmation", () => {
    const out = settleOutcomes([m("a", { checked_in: true, geo_ok: true }), m("b", { checked_in: true }), m("c", { confirms: 1 }), m("d"), m("e", { left_at: "x" }), m("f", { left_at: "x", late_cancel: true })]);
    expect(Object.fromEntries(out.map((o) => [o.id, o.outcome]))).toEqual({ a: "attended", b: "noshow", c: "attended", d: "noshow", e: null, f: "late_cancel" });
  });
  it("penalizes nobody when the whole group has no check-ins", () => {
    const out = settleOutcomes([m("a"), m("b"), m("c", { left_at: "x", late_cancel: true })]);
    expect(out.map((o) => o.outcome)).toEqual(["excused", "excused", "excused"]);
  });
  it("blocks 30 days after one strike and 90 days after two within 90 days", () => {
    const now = new Date("2026-11-10T00:00:00Z");
    expect(penaltyUntil([], now)).toBeNull();
    expect(penaltyUntil([new Date(now.getTime() - 5 * DAY)], now)!.getTime()).toBe(now.getTime() + 25 * DAY);
    expect(penaltyUntil([new Date(now.getTime() - 31 * DAY)], now)).toBeNull();
    const two = penaltyUntil([new Date(now.getTime() - 80 * DAY), new Date(now.getTime() - 2 * DAY)], now)!;
    expect(two.getTime()).toBe(now.getTime() + 88 * DAY);
    expect(penaltyUntil([new Date(now.getTime() - 100 * DAY), new Date(now.getTime() - 2 * DAY)], now)!.getTime()).toBe(now.getTime() + 28 * DAY);
    expect(penaltyText(new Date("2026-12-08T00:00:00Z"))).toBe("다음 조 신청은 12/8부터 가능해요");
  });
  it("shows the keep badge from 2 attended", () => {
    expect(keepBadge(1)).toBeNull();
    expect(keepBadge(2)).toBe("🤝 약속 지킴 2회");
  });
});

describe("💬 조 채팅 연락처 가림", () => {
  it("masks phones, emails, open.kakao links and messenger IDs", () => {
    const c = cleanChat("010-1234-5678 로 연락 주세요 a@b.com https://open.kakao.com/o/abc 카톡 아이디: hello_99 02-123-4567");
    expect(c.masked).toBe(true);
    expect(c.text).not.toMatch(/1234-5678|a@b\.com|open\.kakao|hello_99|123-4567/);
    expect(cleanChat("open.kakao.com/o/xyz").text).not.toMatch(/kakao/);
    expect(cleanChat("입구 앞에서 10시에 봬요").masked).toBe(false);
    expect(cleanChat("씨발 늦지마").reject).toBeTruthy();
  });
});

describe("🎫 행사 날짜·카드·공유", () => {
  const created = new Date("2026-10-20T03:00:00Z");
  it("reads the event span from the title, else body", () => {
    const s = eventSpan({ id: "1", title: "[행사] 서울레코드페어 · 10/31(토)~11/1(일) 성수", body: "", created_at: created })!;
    expect(s.end - s.start).toBe(1);
    expect(eventSpan({ id: "1", title: "[행사] 굿즈 마켓", body: "일시: 11/8(일) 11시", created_at: created })).not.toBeNull();
    expect(eventSpan({ id: "1", title: "[행사] 응모 (~10/31 마감)", body: "", created_at: created })).toBeNull();
  });
  it("builds share-card data and hides the going count under 3", () => {
    const p = { id: "9", title: "[행사] 서울레코드페어 · 10/31(토)~11/1(일)", body: "", created_at: created, room: "LP 덕후방" };
    const now = new Date("2026-10-26T03:00:00Z");
    expect(eventCardData(p, 2, now)).toMatchObject({ name: "서울레코드페어", when: "10/31~11/1", dday: "D-5", going: null });
    expect(eventCardData(p, 3, now).going).toBe("같이 갈 사람 3명");
  });
  it("finds the first official link and counts ?from=share as 공유 링크", () => {
    expect(firstOfficialUrl("예매 https://ticket.example.com/a, 오픈채팅 https://open.kakao.com/o/x")).toBe("https://ticket.example.com/a");
    expect(firstOfficialUrl("https://open.kakao.com/o/x")).toBeNull();
    expect(classifySource({ landing: true, siteHost: "nobangjang.com", from: "share" })).toEqual({ source: "social", host: SHARE_HOST });
  });
  it("blocks under-14 and requires the no-show rule checkbox", () => {
    const base = { day: "2026-11-05", slot: "am", age: "teen", nickname: "러너", pw: "1234", agree: true, over14: true };
    expect(poolSchema.safeParse(base).success).toBe(true);
    expect(poolSchema.safeParse({ ...base, over14: false }).success).toBe(false);
    expect(poolSchema.safeParse({ ...base, agree: false }).success).toBe(false);
  });
});
