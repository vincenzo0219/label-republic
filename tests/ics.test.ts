import { describe, expect, it } from "vitest";
import { buildIcs, escapeText, foldLine, icsDate, icsUtc } from "@/lib/ics";
import { isoDayNumber } from "@/lib/adSchedule";

const octets = (s: string) => new TextEncoder().encode(s).length;
const unfold = (s: string) => s.replace(/\r\n[ \t]/g, "");

describe("ics (RFC 5545)", () => {
  it("escapes backslash, semicolon, comma and newlines", () => {
    expect(escapeText("a,b;c\\d\ne\r\nf")).toBe("a\\,b\\;c\\\\d\\ne\\nf");
  });

  it("folds at 75 octets without splitting Korean or emoji characters", () => {
    const line = `SUMMARY:${"🎫 코믹월드 (애니·만화 덕후방) ".repeat(6)}`;
    const folded = foldLine(line);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(octets(p)).toBeLessThanOrEqual(75);
    for (const p of parts.slice(1)) expect(p.startsWith(" ")).toBe(true);
    expect(unfold(folded)).toBe(line);
    expect(foldLine("SHORT:x")).toBe("SHORT:x");
  });

  it("formats dates and UTC times", () => {
    expect(icsDate(isoDayNumber("2026-10-31"))).toBe("20261031");
    expect(icsUtc(Date.UTC(2026, 9, 31, 10, 5, 9))).toBe("20261031T100509Z");
  });

  it("builds a calendar with CRLF lines, all-day DTEND next day and a D-1 09:00 alarm", () => {
    const day = isoDayNumber("2026-10-31");
    const ics = buildIcs({
      name: "노방장 · 내 방 행사",
      now: new Date(Date.UTC(2026, 9, 26, 3, 0, 0, 500)),
      refresh: "PT6H",
      events: [{ uid: "a@x", summary: "행사, 하나", description: "줄1\n줄2", url: "https://nobangjang.com/posts/1", allDay: { start: day, end: day + 1 }, alarm: true }],
    });
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/\n/);
    const lines = unfold(ics).split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("DTSTART;VALUE=DATE:20261031");
    expect(lines).toContain("DTEND;VALUE=DATE:20261102");
    expect(lines).toContain("DTSTAMP:20261026T030000Z");
    expect(lines).toContain("TRIGGER:-PT15H");
    expect(lines).toContain("SUMMARY:행사\\, 하나");
    expect(lines).toContain("DESCRIPTION:줄1\\n줄2");
    expect(lines).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT6H");
    expect(lines).toContain("X-PUBLISHED-TTL:PT6H");
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(1);
    expect(lines.at(-2)).toBe("END:VCALENDAR");
  });

  it("uses a one-day-before trigger and one hour end for timed events", () => {
    const start = Date.UTC(2026, 9, 31, 10, 0);
    const lines = unfold(buildIcs({ name: "x", events: [{ uid: "t@x", summary: "s", at: { start }, alarm: true }] })).split("\r\n");
    expect(lines).toContain("DTSTART:20261031T100000Z");
    expect(lines).toContain("DTEND:20261031T110000Z");
    expect(lines).toContain("TRIGGER:-P1D");
  });
});
