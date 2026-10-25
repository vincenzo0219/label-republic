import { describe, expect, it } from "vitest";
import { eventDday, eventDdayLabel, sortByEventDday, type EventDday, type SchedulePost } from "@/lib/adSchedule";
import { getReadPosts, markRead, MAX_READ_POSTS, READ_POSTS_KEY } from "@/lib/readPosts";
import { hasReportItems, reportBoards, reportQuery, type ReportInput } from "@/lib/reportQuery";
import { stableSeen } from "@/lib/seen";
import { kstDayStart, roomPushMessage, roomQuietNow } from "@/lib/jobs/roomPush";

/** 다음 날 다시 오는 이유 (10/25 페르소나 Day 2): 📬 새 소식 · 🎫 행사 D-day · 🆕 내 방 새 글 알림 */

function memStore(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  mine: ["러닝-덕후방", "와인-위스키-덕후방"],
  interests: ["커피-덕후방"],
  products: [],
  posts: [],
  comments: [],
  since: "2026-10-24T12:00:00.000Z",
  seen: "%EB%9F%AC%EB%8B%9D-%EB%8D%95%ED%9B%84%EB%B0%A9:1761300000000",
  read: ["11", "12"],
  ...over,
});

describe("📬 새 소식: badge and report share one request (10/25)", () => {
  it("starred rooms are the 관심 방; old ☆ interests only when nothing is starred", () => {
    expect(reportBoards(["a", "b"], ["c"])).toEqual(["a", "b"]);
    expect(reportBoards([], ["c", "c", "d"])).toEqual(["c", "d"]);
    expect(reportBoards([], [])).toEqual([]);
    expect(hasReportItems(input({ mine: [], interests: [] }))).toBe(false);
    expect(hasReportItems(input({ mine: [], interests: [], comments: ["1.x"] }))).toBe(true);
  });

  it("the badge count and the /me new list send the same filters", () => {
    const badge = reportQuery(input(), "new", true);
    const list = reportQuery(input(), "new");
    expect(badge.get("count")).toBe("1");
    badge.delete("count");
    expect(badge.toString()).toBe(list.toString());
    expect(list.get("boards")).toBe("러닝-덕후방,와인-위스키-덕후방");
    expect(list.get("read")).toBe("11,12");
    expect(list.get("since")).toBe("2026-10-24T12:00:00.000Z");
    expect(list.get("seen")).toBeTruthy();
  });

  it("the 7-day view ignores seen time, room visits and opened posts", () => {
    const week = reportQuery(input(), "week");
    expect(week.get("boards")).toBe("러닝-덕후방,와인-위스키-덕후방");
    expect(week.has("since")).toBe(false);
    expect(week.has("seen")).toBe(false);
    expect(week.has("read")).toBe(false);
  });

  it("a room visit in between does not wipe what the badge counted (pre-visit snapshot for 30 min)", () => {
    const now = 1_761_400_000_000;
    const before = now - 86_400_000;
    // 홈에서 배지를 센 뒤 방에 들어갔다: 저장 값은 지금, 들어가기 전 값은 snapshot 에
    const stored = { 러닝: now - 60_000, 와인: before };
    const snap = { 러닝: { taken: now - 60_000, v: before } };
    expect(stableSeen(["러닝", "와인", "커피"], stored, snap, now)).toEqual({ 러닝: before, 와인: before });
    // 30분이 지나면 방에서 본 시각부터 다시 센다
    expect(stableSeen(["러닝"], stored, snap, now + 31 * 60_000)).toEqual({ 러닝: now - 60_000 });
    // 처음 들어간 방(전에 본 적 없음)은 공통 기준만
    expect(stableSeen(["새방"], { 새방: now }, { 새방: { taken: now, v: null } }, now)).toEqual({});
  });

  it("remembers opened posts, newest last, bounded", () => {
    const st = memStore();
    markRead("5", st);
    markRead("6", st);
    markRead("5", st);
    markRead("abc", st);
    expect(getReadPosts(st)).toEqual(["6", "5"]);
    for (let i = 0; i < MAX_READ_POSTS + 10; i++) markRead(String(1000 + i), st);
    const all = getReadPosts(st);
    expect(all).toHaveLength(MAX_READ_POSTS);
    expect(all.at(-1)).toBe(String(1000 + MAX_READ_POSTS + 9));
    expect(getReadPosts(memStore({ [READ_POSTS_KEY]: "{bad" }))).toEqual([]);
    expect(getReadPosts(null)).toEqual([]);
  });
});

// 2026-10-25(일) 21:30 KST
const NOW = new Date("2026-10-25T12:30:00Z");
const post = (id: string, title: string, body = "", created_at = "2026-10-22T01:00:00Z"): SchedulePost => ({ id, title, body, created_at });

describe("🎫 행사 tab: nearest first, D-day badges (10/25)", () => {
  const garmin = post("1", "[행사] 가민 런 코리아 11/15 · SKT 런메이트 캠프 ~11/1 (러닝 2곳)", "📍 2026 가민 런 코리아 · 11/15(일) 고양\n📍 SKT 런메이트 캠프 · ~11/1(일)");
  const daegu = post("2", "[행사] 11월 말~12월 대회 + 2027 대구마라톤 접수 (10/26~12/6)", "📍 2027 대구마라톤 10km 접수 · 10/26(월)~11/1(일) 온라인");
  const trail = post("3", "[행사] 10월 말~11월 마라톤·트레일 7곳 (10/30~11/22)", "📍 울주 트레일 · 10/30(금)~11/1(일)");
  const past = post("4", "[행사] 춘천마라톤 · 10/18(일)", "");
  const none = post("5", "[혜택] 러닝화 쿠폰", "링크 참고");

  it("D-n to the nearest start (or the end of a running one), 마감 when all dates passed, null without dates", () => {
    expect(eventDday(daegu, NOW)).toBe(1);
    expect(eventDday(trail, NOW)).toBe(5);
    expect(eventDday(garmin, NOW)).toBe(7);
    expect(eventDday(past, NOW)).toBe("ended");
    expect(eventDday(none, NOW)).toBeNull();
    expect(eventDday(post("6", "[행사] 오늘 · 10/25(일)"), NOW)).toBe(0);
    expect([1, 0, "ended", null].map((d) => eventDdayLabel(d as EventDday))).toEqual(["D-1", "D-day", "마감", null]);
  });

  it("orders upcoming by D-day, undated in their original order, finished last", () => {
    const items = [garmin, past, none, daegu, trail];
    const dd = new Map(items.map((p) => [p.id, eventDday(p, NOW)] as const));
    expect(sortByEventDday(items, dd).map((p) => p.id)).toEqual(["2", "3", "1", "5", "4"]);
    // 날짜를 모르면 그대로
    expect(sortByEventDday([none, garmin], new Map()).map((p) => p.id)).toEqual(["5", "1"]);
  });
});

describe("🆕 내 방 새 글 push (10/25)", () => {
  it("formats the message with the room name and a 30-char title", () => {
    const m = roomPushMessage({ id: "42", title: "11월 대회 나가는 분?", slug: "러닝-덕후방", room: "러닝 덕후방" });
    expect(m).toEqual({ title: "🆕 러닝 덕후방 새 글: 11월 대회 나가는 분?", body: "", url: "/posts/42?from=push", tag: "lr-room-러닝-덕후방" });
    const long = roomPushMessage({ id: "1", title: "가".repeat(40), slug: "a", room: "A" });
    expect(long.title).toBe(`🆕 A 새 글: ${"가".repeat(30)}…`);
    expect(m.title).not.toContain("—");
  });

  it("uses the KST day and quiet hours", () => {
    expect(kstDayStart(new Date("2026-10-25T12:30:00Z")).toISOString()).toBe("2026-10-24T15:00:00.000Z");
    expect(kstDayStart(new Date("2026-10-25T15:30:00Z")).toISOString()).toBe("2026-10-25T15:00:00.000Z");
    expect(roomQuietNow(new Date("2026-10-25T12:30:00Z"))).toBe(false); // 21:30
    expect(roomQuietNow(new Date("2026-10-25T13:30:00Z"))).toBe(true); // 22:30
    expect(roomQuietNow(new Date("2026-10-25T22:30:00Z"))).toBe(true); // 07:30
    expect(roomQuietNow(new Date("2026-10-25T23:00:00Z"))).toBe(false); // 08:00
  });
});
