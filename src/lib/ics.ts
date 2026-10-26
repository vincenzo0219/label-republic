/**
 * 📅 달력 파일 (RFC 5545) 만들기 (10/26) — 방 행사 구독(/cal/rooms.ics)과 🎉 덕질 기념일 내려받기가 같이 쓴다.
 * 서버·브라우저·테스트 공용 순수 함수 (Node 전용 API 없음). 줄 끝은 CRLF, 한 줄은 75옥텟에서 접는다.
 */

/** 하루 종일 일정: 날짜는 KST 일 번호 (1970-01-01 = 0, src/lib/adSchedule.ts 의 kstDayNumber 와 같은 기준) */
export type IcsEvent = {
  uid: string;
  summary: string;
  description?: string;
  url?: string;
  /** 하루 종일: 시작일·끝나는 날(그날 포함) */
  allDay?: { start: number; end: number };
  /** 시각이 있는 일정: UTC 밀리초 (끝을 모르면 1시간) */
  at?: { start: number; end?: number };
  /** 미리 알림: 하루 종일은 전날 09:00, 시각 일정은 하루 전 */
  alarm?: boolean;
};

export type IcsCalendar = {
  name: string;
  events: readonly IcsEvent[];
  now?: Date;
  /** 구독 달력이면 다시 가져올 간격 (예: "PT6H") */
  refresh?: string;
};

const DAY = 86_400_000;

/** TEXT 값 이스케이프: \ ; , 줄바꿈 (RFC 5545 3.3.11) */
export function escapeText(s: string): string {
  return s.replace(/\r\n?/g, "\n").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

const enc = new TextEncoder();
const octets = (s: string) => enc.encode(s).length;

/**
 * 한 줄을 75옥텟씩 접는다 (이어지는 줄은 공백 하나로 시작, 그 공백까지 75옥텟). 한글·이모지 글자 중간에서 자르지 않는다.
 */
export function foldLine(line: string): string {
  if (octets(line) <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let size = 0;
  let limit = 75;
  for (const ch of line) {
    const n = octets(ch);
    if (size + n > limit) {
      out.push(cur);
      cur = "";
      size = 0;
      limit = 74; // 앞의 공백 한 칸
    }
    cur += ch;
    size += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** 일 번호 → "20261031" */
export function icsDate(day: number): string {
  const d = new Date(day * DAY);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

/** UTC 밀리초 → "20261031T100000Z" */
export function icsUtc(ms: number): string {
  const d = new Date(ms);
  return `${icsDate(Math.floor(ms / DAY))}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function eventLines(e: IcsEvent, stamp: string): string[] {
  const lines = ["BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${stamp}`];
  if (e.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${icsDate(e.allDay.start)}`, `DTEND;VALUE=DATE:${icsDate(Math.max(e.allDay.end, e.allDay.start) + 1)}`, "TRANSP:TRANSPARENT");
  } else if (e.at) {
    lines.push(`DTSTART:${icsUtc(e.at.start)}`, `DTEND:${icsUtc(e.at.end ?? e.at.start + 3600_000)}`);
  }
  lines.push(`SUMMARY:${escapeText(e.summary)}`);
  if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
  if (e.url) lines.push(`URL:${e.url}`);
  if (e.alarm) {
    // 하루 종일 일정의 시작은 그날 0시 → 15시간 전 = 전날 09:00
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeText(e.summary)}`, `TRIGGER:${e.allDay ? "-PT15H" : "-P1D"}`, "END:VALARM");
  }
  lines.push("END:VEVENT");
  return lines;
}

/** VCALENDAR 전체 (CRLF, 접힌 줄) */
export function buildIcs(cal: IcsCalendar): string {
  const stamp = icsUtc(Math.floor((cal.now ?? new Date()).getTime() / 1000) * 1000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//nobangjang.com//노방장//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(cal.name)}`,
    "X-WR-TIMEZONE:Asia/Seoul",
  ];
  if (cal.refresh) lines.push(`REFRESH-INTERVAL;VALUE=DURATION:${cal.refresh}`, `X-PUBLISHED-TTL:${cal.refresh}`);
  for (const e of cal.events) lines.push(...eventLines(e, stamp));
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** UID 에 붙이는 짧은 해시 (같은 글의 여러 행사를 나누는 용도, 보안 용도 아님) */
export function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (const ch of s) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
