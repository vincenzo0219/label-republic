/**
 * 📅 내 행사 달력 (10/29 대표님): 만남 행사 카드에 ⭐ 관심을 누르면 이 브라우저에만 기억하고,
 * 관심 행사를 다음 날짜(모집 시작 · 접수 마감 · 행사일)가 가까운 순으로 모아 보여 준다. 로그인 없음.
 */
import { daysBetween, singlesEventPath, type SinglesEvent } from "./singlesEvents";

export const STAR_KEY = "lr:singlesStar";

export type KeyDate = { label: "모집 시작" | "접수 마감" | "행사"; date: string; dday: number };

type Dated = Pick<SinglesEvent, "applyStart" | "applyEnd" | "eventDate">;

/** 오늘부터 남은 날짜들 (가까운 순) */
export function keyDates(ev: Dated, today: string): KeyDate[] {
  const out: KeyDate[] = [];
  const add = (label: KeyDate["label"], date: string | null) => {
    if (date && date >= today) out.push({ label, date, dday: daysBetween(today, date) });
  };
  add("모집 시작", ev.applyStart);
  add("접수 마감", ev.applyEnd);
  add("행사", ev.eventDate);
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export const ddayText = (d: number) => (d === 0 ? "오늘" : `D-${d}`);

/** 관심 행사만, 다음 날짜가 가까운 순. 남은 날짜가 없는(지난) 행사는 맨 뒤 */
export function sortStarred<T extends Dated & { id: string }>(events: readonly T[], starred: ReadonlySet<string>, today: string): { event: T; next: KeyDate[] }[] {
  return events
    .filter((e) => starred.has(e.id))
    .map((event) => ({ event, next: keyDates(event, today) }))
    .sort((a, b) => {
      const x = a.next[0]?.date ?? "9999";
      const y = b.next[0]?.date ?? "9999";
      return x.localeCompare(y) || a.event.id.localeCompare(b.event.id);
    });
}

const icsText = (s: string) => s.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
const icsDay = (ymd: string) => ymd.replace(/-/g, "");
const nextDay = (ymd: string) => new Date(Date.parse(`${ymd}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** 관심 행사의 접수 마감·행사일을 종일 일정으로 (내 폰 달력에 추가) */
export function starIcs(events: readonly (Dated & Pick<SinglesEvent, "id" | "title">)[], today: string, siteUrl: string): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//nobangjang//singles//KO", "CALSCALE:GREGORIAN"];
  for (const e of events) {
    for (const k of keyDates(e, today)) {
      if (k.label === "모집 시작") continue;
      lines.push(
        "BEGIN:VEVENT",
        `UID:singles-${e.id}-${k.label === "행사" ? "event" : "deadline"}@nobangjang.com`,
        `DTSTART;VALUE=DATE:${icsDay(k.date)}`,
        `DTEND;VALUE=DATE:${icsDay(nextDay(k.date))}`,
        `SUMMARY:${icsText(`${k.label === "행사" ? "💌" : "⏰ 접수 마감"} ${e.title}`)}`,
        `URL:${siteUrl}${singlesEventPath(e.id)}`,
        "END:VEVENT",
      );
    }
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
