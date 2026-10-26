import { describe, expect, it } from "vitest";
import { isoDayNumber } from "@/lib/adSchedule";
import {
  addFanDay,
  cardBody,
  cardTitle,
  cheeredPosts,
  countText,
  dayCount,
  fanDayPosts,
  fanDaysIcs,
  friendlyNickname,
  getFanDays,
  isMilestoneDay,
  nextBirthday,
  nextMilestones,
  nthDay,
  reactionCountText,
  rememberCheer,
  rememberFanDayPost,
  removeFanDay,
  todayOccasion,
  validIso,
} from "@/lib/fanDays";

/** KST 그날 정오 */
const at = (iso: string) => new Date(`${iso}T12:00:00+09:00`);
const D = (s: string) => isoDayNumber(s);
function memStore(): Storage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) } as Storage;
}

describe("덕질 기념일: 세는 법 (고른 날짜 = 1일째)", () => {
  it("counts the chosen date itself as day 1", () => {
    expect(dayCount("2026-10-26", at("2026-10-26"))).toBe(1);
    expect(dayCount("2026-10-26", at("2026-10-27"))).toBe(2);
    expect(dayCount("2026-10-26", at("2026-10-25"))).toBe(0);
    // KST 기준: UTC 로는 전날 밤이어도 KST 로 그날이면 1일째
    expect(dayCount("2026-10-26", new Date("2026-10-25T15:30:00Z"))).toBe(1);
  });

  it("puts day 10 at date + 9 and day 100 at date + 99", () => {
    expect(nthDay("2026-01-01", 10)).toBe(D("2026-01-10"));
    expect(nthDay("2026-01-01", 100)).toBe(D("2026-04-10"));
    expect(dayCount("2026-01-01", at("2026-04-10"))).toBe(100);
  });

  it("counts across leap days", () => {
    expect(dayCount("2024-02-28", at("2024-03-01"))).toBe(3); // 2/28, 2/29, 3/1
    expect(dayCount("2023-02-28", at("2023-03-01"))).toBe(2);
    expect(nthDay("2024-02-01", 100)).toBe(D("2024-05-10"));
    expect(nthDay("2023-02-01", 100)).toBe(D("2023-05-11"));
  });

  it("milestones are 1, 10, then every 100 days with no upper limit and no anniversaries", () => {
    expect([1, 10, 100, 200, 300, 1000, 36500].every(isMilestoneDay)).toBe(true);
    expect([2, 9, 11, 50, 365, 366, 150].some(isMilestoneDay)).toBe(false);
    const f = { preset: "ipduk" as const, date: "2026-01-01" };
    expect(nextMilestones(f, at("2025-12-30"), 3).map((m) => [m.n, m.dday])).toEqual([[1, 2], [10, 11], [100, 101]]);
    expect(nextMilestones(f, at("2026-01-01"), 3).map((m) => m.n)).toEqual([1, 10, 100]);
    expect(nextMilestones(f, at("2026-01-02"), 2).map((m) => m.n)).toEqual([10, 100]);
    expect(nextMilestones(f, at("2026-01-10"), 2).map((m) => [m.n, m.dday])).toEqual([[10, 0], [100, 90]]);
    expect(nextMilestones(f, at("2026-01-11"), 3).map((m) => m.n)).toEqual([100, 200, 300]);
    expect(nextMilestones(f, at("2030-01-01"), 2).map((m) => m.n)).toEqual([1500, 1600]);
  });

  it("birthdays are yearly on the month/day, Feb 29 on Feb 28 in common years", () => {
    expect(nextBirthday("2000-02-29", at("2025-01-10")).day).toBe(D("2025-02-28"));
    expect(nextBirthday("2000-02-29", at("2028-01-10")).day).toBe(D("2028-02-29"));
    expect(nextBirthday("1999-10-26", at("2026-10-26")).dday).toBe(0);
    expect(nextBirthday("1999-10-25", at("2026-10-26")).day).toBe(D("2027-10-25"));
    const ms = nextMilestones({ preset: "bday", date: "2000-02-29" }, at("2026-10-26"), 3);
    expect(ms.map((m) => m.day)).toEqual([D("2027-02-28"), D("2028-02-29"), D("2029-02-28")]);
  });

  it("offers a card on the registration day and afterwards only on milestone days", () => {
    const f = { preset: "start" as const, date: "2026-07-01" };
    expect(todayOccasion(f, at("2026-10-26"), true)).toEqual({ unit: "days", n: 118 });
    expect(todayOccasion(f, at("2026-10-26"))).toBeNull();
    expect(todayOccasion(f, at("2026-10-08"))).toEqual({ unit: "days", n: 100 });
    expect(todayOccasion(f, at("2026-07-10"))).toEqual({ unit: "days", n: 10 });
    expect(todayOccasion({ preset: "ipduk", date: "2026-11-01" }, at("2026-10-26"), true)).toBeNull();
    // 1주년(366일째)은 기념일이 아니다
    expect(todayOccasion({ preset: "ipduk", date: "2025-10-26" }, at("2026-10-26"))).toBeNull();
    const b = { preset: "bday" as const, date: "1998-11-03" };
    expect(todayOccasion(b, at("2026-11-03"))).toEqual({ unit: "bday" });
    expect(todayOccasion(b, at("2026-10-26"))).toBeNull();
    expect(todayOccasion(b, at("2026-10-26"), true)).toEqual({ unit: "until", n: 8 });
  });

  it("builds card text from presets only", () => {
    expect(cardTitle("하늘하늘", "start", "러닝", { unit: "days", n: 100 })).toBe("🎉 하늘하늘님 러닝 시작 100일째");
    expect(cardTitle("하늘하늘", "ipduk", "러닝", { unit: "days", n: 1234 })).toBe("🎉 하늘하늘님 입덕 1,234일째");
    expect(cardTitle("하늘하늘", "first", "KBO", { unit: "days", n: 10 })).toBe("🎉 하늘하늘님 첫 직관·참가 10일째");
    expect(cardTitle("하늘하늘", "bday", "KBO", { unit: "bday" })).toBe("🎂 오늘 하늘하늘님 최애 생일");
    expect(cardTitle("하늘하늘", "bday", "KBO", { unit: "until", n: 8 })).toBe("🎂 하늘하늘님 최애 생일까지 8일");
    expect(cardBody("하늘하늘", "ipduk", "러닝", { unit: "days", n: 100 })).toContain("입덕 100일째");
    expect(countText({ preset: "ipduk", date: "2026-10-20" }, "러닝", at("2026-10-26"))).toBe("입덕 7일째");
    expect(countText({ preset: "bday", date: "1990-10-26" }, "러닝", at("2026-10-26"))).toBe("오늘은 최애 생일!");
    const nick = friendlyNickname(12345);
    expect(nick.length).toBeLessThanOrEqual(20);
    expect(nick).toMatch(/^\S+ 덕후 \d{2}$/);
    expect(reactionCountText("fanday", 12)).toBe("🎉 12명이 축하했어요");
    expect(reactionCountText("cheer", 3)).toBe("💪 3명이 응원했어요");
  });

  it("stores up to 5 anniversaries locally and survives broken or missing storage", () => {
    expect(validIso("2026-02-30")).toBe(false);
    const s = memStore();
    expect(getFanDays(s)).toEqual([]);
    const a = addFanDay({ preset: "ipduk", date: "2026-01-01", room: "kbo-덕후방" }, s, "a1");
    expect(a).toEqual({ id: "a1", preset: "ipduk", date: "2026-01-01", room: "kbo-덕후방" });
    expect(addFanDay({ preset: "ipduk", date: "2026-13-01", room: "kbo-덕후방" }, s, "a2")).toBe("invalid");
    for (const id of ["b", "c", "d", "e"]) addFanDay({ preset: "first", date: "2025-05-05", room: "kbo-덕후방" }, s, id);
    expect(addFanDay({ preset: "first", date: "2025-05-05", room: "kbo-덕후방" }, s, "f")).toBe("full");
    removeFanDay("b", s);
    expect(getFanDays(s).map((x) => x.id)).toEqual(["a1", "c", "d", "e"]);
    s.setItem("nb:fanDays", "{broken");
    expect(getFanDays(s)).toEqual([]);
    expect(getFanDays(null)).toEqual([]);
    expect(addFanDay({ preset: "ipduk", date: "2026-01-01", room: "x" }, null)).toBe("nostore");
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } } as unknown as Storage;
    expect(getFanDays(throwing)).toEqual([]);
    expect(addFanDay({ preset: "ipduk", date: "2026-01-01", room: "x" }, throwing)).toBe("nostore");
  });

  it("remembers posted cards and cheered posts", () => {
    const s = memStore();
    rememberFanDayPost("a1", { postId: "42", occ: "days100", day: "2026-10-26" }, s);
    rememberFanDayPost("a1", { postId: "nope", occ: "x", day: "y" }, s);
    expect(fanDayPosts(s)).toEqual({ a1: { postId: "42", occ: "days100", day: "2026-10-26" } });
    rememberCheer("5", s);
    rememberCheer("5", s);
    expect(cheeredPosts(s)).toEqual(["5"]);
  });

  it("makes a downloadable calendar of upcoming milestones", () => {
    const ics = fanDaysIcs(
      [{ id: "a1", preset: "ipduk", date: "2026-10-20", room: "kbo-덕후방" }, { id: "b1", preset: "bday", date: "2000-02-29", room: "kbo-덕후방" }],
      () => ({ name: "KBO 덕후방", short: "KBO" }),
      "https://nobangjang.com",
      at("2026-10-26"),
    ).replace(/\r\n[ \t]/g, "");
    expect(ics).toContain("X-WR-CALNAME:노방장 · 내 덕질 기념일");
    expect(ics).toContain("SUMMARY:🎉 입덕 10일째");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261029");
    expect(ics).toContain("SUMMARY:🎉 입덕 100일째");
    expect(ics).toContain("DTSTART;VALUE=DATE:20270127");
    expect(ics).toContain("SUMMARY:🎂 최애 생일");
    expect(ics).toContain("DTSTART;VALUE=DATE:20270228");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(7);
  });
});
