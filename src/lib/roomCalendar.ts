/**
 * 📅 내 폰 달력에 추가 (10/26) — 웹 푸시는 거의 닿지 않아서(iPhone 은 홈 화면 추가가 필요) 폰 달력이 대신 알려 주게 한다.
 * 방들의 [행사]·[혜택] 글에서 날짜를 읽어 달력 일정으로 (GET /cal/rooms.ics?r=방,방). 날짜 읽기는 src/lib/adSchedule.ts 그대로.
 * 서버·브라우저·테스트 공용 순수 함수.
 */
import { bare, findDates, kstDayNumber, segmentName, segments, titleName, type Found, type SchedulePost } from "./adSchedule";
import { buildIcs, shortHash, type IcsEvent } from "./ics";
import { roomPlainName } from "./myRooms";

export const CAL_PATH = "/cal/rooms.ics";
export const CAL_NAME = "노방장 · 내 방 행사";
/** 한 구독에 담는 방 수 */
export const CAL_MAX_ROOMS = 10;
/** 지난 일정은 일주일까지, 앞으로는 120일까지 */
export const CAL_BACK_DAYS = 7;
export const CAL_AHEAD_DAYS = 120;

export type CalendarPost = SchedulePost & { room_slug: string; room_name: string };

export type RoomEvent = {
  postId: string;
  name: string;
  room: string;
  kind: "행사" | "혜택";
  /** KST 일 번호 (그날 포함) */
  start: number;
  end: number;
  /** "~10/31", "11/8 마감" 처럼 마감일만 있는 날짜 */
  deadline: boolean;
  when: string;
  /** 하루짜리 행사에 시각이 하나만 적혀 있으면 (KST 분, 0시 기준) */
  minute?: number;
};

const DAY = 86_400_000;
const KST = 9 * 3600_000;
const SLUG_RE = /^[\p{L}\p{N}-]{1,60}$/u;

/** ?r=방,방 → 검사한 slug 목록 (중복·이상한 값 빼고, 정렬해서 캐시 키가 같게). 하나도 없으면 빈 배열 */
export function parseCalRooms(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const out = new Set<string>();
  for (const s of raw.split(",")) {
    const v = s.trim();
    if (SLUG_RE.test(v)) out.add(v);
    if (out.size >= CAL_MAX_ROOMS) break;
  }
  return [...out].sort();
}

/**
 * 글 속 시각: "19:00", "오후 7시", "오후 7시 30분", "저녁 7시 반". 서로 다른 시각이 둘 이상이면("10:00~18:00") 모르는 것으로 본다.
 * 결과는 0시부터 분.
 */
export function findTime(text: string): number | null {
  const found = new Set<number>();
  const clean = text.replace(/https?:\/\/\S+/g, " ");
  for (const m of clean.matchAll(/(?<![\d:])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/g)) found.add(Number(m[1]) * 60 + Number(m[2]));
  for (const m of clean.matchAll(/(오전|오후|낮|저녁|밤)\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분|\s*(반))?/g)) {
    let h = Number(m[2]);
    if (h > 12 || (h === 12 && (m[1] === "저녁" || m[1] === "밤"))) continue;
    const pm = m[1] !== "오전" && !(m[1] === "낮" && h >= 11);
    if (pm && h < 12) h += 12;
    if (m[1] === "오전" && h === 12) h = 0;
    found.add(h * 60 + (m[4] ? 30 : Number(m[3] ?? 0)));
  }
  return found.size === 1 ? [...found][0]! : null;
}

const isDeadline = (f: Found) => f.start === null || /마감$/.test(f.when);
/** 행사일(기간)을 먼저, 마감일만 있으면 그것 */
const pick = (list: Found[]) => list.find((f) => !isDeadline(f)) ?? list[0];

function toEvent(post: CalendarPost, name: string, f: Found, timeText: string): RoomEvent {
  const deadline = isDeadline(f);
  const end = f.end ?? f.start!;
  const start = deadline ? end : f.start!;
  const minute = !deadline && start === end ? findTime(timeText) : null;
  return {
    postId: post.id,
    name,
    room: roomPlainName({ slug: post.room_slug, name: post.room_name }),
    kind: post.title.startsWith("[혜택]") ? "혜택" : "행사",
    start,
    end,
    deadline,
    when: f.when,
    ...(minute !== null ? { minute } : {}),
  };
}

/**
 * 글들(최신순) → 달력 일정. 글마다 행사 칸(📍 이름 · 날짜)을 하나씩, 칸이 없으면 제목(없으면 본문)의 날짜 하나.
 * 오늘 기준 CAL_BACK_DAYS 전 ~ CAL_AHEAD_DAYS 뒤에 걸치는 것만, 같은 이름·같은 날짜는 한 번만(최신 글 것).
 */
export function calendarEvents(posts: readonly CalendarPost[], now = new Date()): RoomEvent[] {
  const today = kstDayNumber(now);
  const out: RoomEvent[] = [];
  const seen = new Set<string>();
  const add = (e: RoomEvent) => {
    if (e.end < today - CAL_BACK_DAYS || e.start > today + CAL_AHEAD_DAYS) return;
    const key = `${e.name.replace(/\s+/g, "")}|${e.start}|${e.end}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(e);
  };
  for (const post of posts) {
    if (!/^\[(행사|혜택)\]/.test(post.title)) continue;
    const refDay = kstDayNumber(new Date(post.created_at));
    let found = false;
    for (const seg of segments(post.body ?? "")) {
      const name = segmentName(seg);
      if (!name) continue;
      const f = pick(findDates(seg, refDay));
      if (!f) continue;
      found = true;
      add(toEvent(post, name, f, seg));
    }
    if (found) continue;
    const f = pick(findDates(bare(post.title), refDay)) ?? pick(findDates(post.body ?? "", refDay));
    if (f) add(toEvent(post, titleName(post.title), f, `${bare(post.title)}\n${post.body ?? ""}`));
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

/** 일정 하나 → 달력 VEVENT 재료. UID 는 글 번호 + 날짜 + 이름이라 다시 받아도 같다 */
export function toIcsEvent(e: RoomEvent, siteUrl: string): IcsEvent {
  const url = `${siteUrl}/posts/${e.postId}`;
  const icon = e.kind === "혜택" ? "🎁" : "🎫";
  return {
    uid: `post-${e.postId}-${e.start}-${e.end}-${shortHash(e.name)}@nobangjang.com`,
    summary: `${icon} ${e.name}${e.deadline ? " 마감" : ""} (${e.room})`,
    description: `${e.when} · ${e.room}\n날짜는 글에서 자동으로 읽었어요. 최종 기준은 원문 공지예요.\n${url}`,
    url,
    ...(e.minute !== undefined ? { at: { start: e.start * DAY + e.minute * 60_000 - KST } } : { allDay: { start: e.start, end: e.end } }),
    alarm: true,
  };
}

/** /cal/rooms.ics 본문 */
export function roomCalendarIcs(posts: readonly CalendarPost[], siteUrl: string, now = new Date()): string {
  return buildIcs({ name: CAL_NAME, now, refresh: "PT6H", events: calendarEvents(posts, now).map((e) => toIcsEvent(e, siteUrl)) });
}

/** 구독 주소들: https(복사용) · webcal(iPhone·Mac) · 구글 캘린더 "URL로 추가" */
export function calendarLinks(origin: string, slugs: readonly string[]): { https: string; webcal: string; google: string } {
  const https = `${origin.replace(/\/$/, "")}${CAL_PATH}?r=${slugs.map(encodeURIComponent).join(",")}`;
  const webcal = https.replace(/^https?:\/\//, "webcal://");
  return { https, webcal, google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}` };
}
