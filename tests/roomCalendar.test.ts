import { describe, expect, it } from "vitest";
import { isoDayNumber } from "@/lib/adSchedule";
import { calendarEvents, calendarLinks, findTime, parseCalRooms, roomCalendarIcs, toIcsEvent, type CalendarPost } from "@/lib/roomCalendar";

// 2026-10-26 (월) KST 12:00
const NOW = new Date("2026-10-26T03:00:00Z");
const post = (id: string, title: string, body = "", created = "2026-10-20T00:00:00Z"): CalendarPost => ({
  id,
  title,
  body,
  created_at: created,
  room_slug: "애니-만화-덕후방",
  room_name: "애니·만화 덕후방",
});
const D = (s: string) => isoDayNumber(s);
const unfold = (s: string) => s.replace(/\r\n[ \t]/g, "");

describe("room calendar (📅 내 폰 달력에 추가)", () => {
  it("validates, dedupes, sorts and caps room slugs", () => {
    expect(parseCalRooms(null)).toEqual([]);
    expect(parseCalRooms("b,a,a, ,../x,<script>")).toEqual(["a", "b"]);
    expect(parseCalRooms(Array.from({ length: 15 }, (_, i) => `r${i}`).join(","))).toHaveLength(10);
  });

  it("finds a single time, but not when several times are written", () => {
    expect(findTime("10/31(토) 19:00 성수")).toBe(19 * 60);
    expect(findTime("오후 7시 30분 시작")).toBe(19 * 60 + 30);
    expect(findTime("저녁 7시 반")).toBe(19 * 60 + 30);
    expect(findTime("오전 12시")).toBe(0);
    expect(findTime("10:00~18:00")).toBeNull();
    expect(findTime("날짜만 10/31")).toBeNull();
    expect(findTime("https://x.com/a?t=10:00")).toBeNull();
  });

  it("extracts one event per dated line, ranges, deadlines and times", () => {
    const evs = calendarEvents(
      [
        post("1", "[행사] 코믹월드 · 10/31(토)~11/1(일) 킨텍스"),
        post("2", "[혜택] 원두 할인 (~11/5)"),
        post("3", "[행사] 이번 주 모음", "📍 가민 런 코리아 · 11/15(일) 고양\n📍 서울레코드페어 · 11/8(토) 19:00 성수"),
        post("4", "잡담 11/3 모임"),
      ],
      NOW,
    );
    expect(evs.map((e) => [e.name, e.start, e.end, e.deadline, e.minute ?? null])).toEqual([
      ["코믹월드", D("2026-10-31"), D("2026-11-01"), false, null],
      ["원두 할인", D("2026-11-05"), D("2026-11-05"), true, null],
      ["서울레코드페어", D("2026-11-08"), D("2026-11-08"), false, 19 * 60],
      ["가민 런 코리아", D("2026-11-15"), D("2026-11-15"), false, null],
    ]);
    expect(evs[1]!.kind).toBe("혜택");
    expect(evs[0]!.room).toBe("애니·만화 덕후방");
  });

  it("keeps today-7d..+120d only and drops the same name and dates from older posts", () => {
    const evs = calendarEvents(
      [
        post("10", "[행사] 지난 행사 · 10/10(토)"),
        post("11", "[행사] 막 끝난 행사 · 10/20(화)"),
        post("12", "[행사] 먼 행사 · 3/20", "", "2026-10-25T00:00:00Z"),
        post("13", "[행사] 코믹월드 · 10/31(토)"),
        post("14", "[행사] 코믹월드 · 10/31(토)", "", "2026-10-01T00:00:00Z"),
      ],
      NOW,
    );
    expect(evs.map((e) => [e.postId, e.name])).toEqual([
      ["11", "막 끝난 행사"],
      ["13", "코믹월드"],
    ]);
  });

  it("makes stable UIDs, summary with room, description with the source note and URL", () => {
    const [e] = calendarEvents([post("7", "[행사] 코믹월드 · 10/31(토)")], NOW);
    const a = toIcsEvent(e!, "https://nobangjang.com");
    const b = toIcsEvent(calendarEvents([post("7", "[행사] 코믹월드 · 10/31(토)")], new Date("2026-10-27T03:00:00Z"))[0]!, "https://nobangjang.com");
    expect(a.uid).toBe(b.uid);
    expect(a.uid).toMatch(/^post-7-\d+-\d+-[0-9a-z]+@nobangjang\.com$/);
    expect(a.summary).toBe("🎫 코믹월드 (애니·만화 덕후방)");
    expect(a.description).toContain("최종 기준은 원문 공지");
    expect(a.description).toContain("https://nobangjang.com/posts/7");
    expect(a.url).toBe("https://nobangjang.com/posts/7");
    expect(a.allDay).toEqual({ start: D("2026-10-31"), end: D("2026-10-31") });
  });

  it("writes timed events in UTC (KST 19:00 = 10:00Z)", () => {
    const ics = unfold(roomCalendarIcs([post("8", "[행사] 페어 · 11/8(토) 19:00")], "https://nobangjang.com", NOW));
    expect(ics).toContain("DTSTART:20261108T100000Z");
    expect(ics).toContain("X-WR-CALNAME:노방장 · 내 방 행사");
    expect(ics).toContain("TRIGGER:-P1D");
  });

  it("builds webcal, Google and copy links", () => {
    const l = calendarLinks("https://nobangjang.com/", ["커피-덕후방", "keyboards"]);
    expect(l.https).toBe(`https://nobangjang.com/cal/rooms.ics?r=${encodeURIComponent("커피-덕후방")},keyboards`);
    expect(l.webcal.startsWith("webcal://nobangjang.com/cal/rooms.ics?r=")).toBe(true);
    expect(l.google).toBe(`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(l.webcal)}`);
  });
});
