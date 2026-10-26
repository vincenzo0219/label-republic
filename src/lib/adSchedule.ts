/**
 * 🎫 이번 주 일정 (10/24) — 인스타 광고(?from=ig_*)로 방에 처음 들어온 사람에게 방의 쓸모(가까운 마감·행사)를 맨 위에 먼저.
 * 방의 [행사]·[혜택] 글(30일) 제목·본문에서 "10/26~11/1", "11/8 마감", "10/31(토)" 같은 날짜를 찾아 가까운 순으로 3줄.
 * 서버·테스트 공용 순수 함수. 날짜 계산은 모두 KST 달력 기준.
 */
import { HEAD_PREFIX } from "./heads";

/** 광고 유입: from=ig_ad, ig_story, ig_reels… (from=ig 하나만 와도) */
export const isAdLanding = (from: string | string[] | undefined): boolean => {
  const v = Array.isArray(from) ? from[0] : from;
  return !!v && /^ig(_|$)/i.test(v);
};

export type SchedulePost = { id: string; title: string; body: string; created_at: string | Date };
export type ScheduleLine = { postId: string; name: string; when: string; dday: number };

const DAY = 86_400_000;
const KST = 9 * 3600_000;
/** 앞으로 이 날수 안의 일정만 (본문의 "3/5" 같은 다른 숫자가 먼 날짜로 잡히는 걸 막는다) */
const HORIZON_DAYS = 60;

/** KST 달력 날짜 → 일 번호 (1970-01-01 = 0) */
export const kstDayNumber = (d: Date): number => Math.floor((d.getTime() + KST) / DAY);

function dayNumber(y: number, m: number, d: number): number | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  if (back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  return t / DAY;
}

/** 연도 없는 M/D → 글 쓴 날 기준으로 가장 그럴듯한 해 (90일보다 더 지난 날짜면 내년) */
function resolve(m: number, d: number, refDay: number): number | null {
  const refYear = new Date(refDay * DAY).getUTCFullYear();
  const n = dayNumber(refYear, m, d) ?? dayNumber(refYear + 1, m, d);
  if (n === null) return null;
  return n < refDay - 90 ? dayNumber(refYear + 1, m, d) : n;
}

const DOW = String.raw`(?:\s*\([월화수목금토일]\))?`;
const MD = String.raw`(\d{1,2})\s*(?:\/|월\s*)(\d{1,2})일?`;
/** (~)M/D(요일)(~(M/)D(요일)) — 앞뒤에 숫자·슬래시가 붙은 건(24/7, 1/2/3, 주소) 빼고 */
const DATE_RE = new RegExp(
  String.raw`(~\s*)?(?<![\d/])` + MD + DOW + String.raw`(?![\d/])(?:\s*[~～]\s*(?:(\d{1,2})\s*(?:\/|월\s*))?(\d{1,2})일?` + DOW + String.raw`(?![\d/]))?(\s*마감)?`,
  "g",
);

export type Found = { start: number | null; end: number | null; when: string };

const md = (n: number) => {
  const d = new Date(n * DAY);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};

/** 글 안의 날짜들 (나온 순서대로) */
export function findDates(text: string, refDay: number): Found[] {
  const clean = text.replace(/https?:\/\/\S+/g, " ");
  const out: Found[] = [];
  for (const m of clean.matchAll(DATE_RE)) {
    const [, until, m1, d1, m2, d2, deadline] = m;
    const a = resolve(Number(m1), Number(d1), refDay);
    if (a === null) continue;
    if (until) {
      out.push({ start: null, end: a, when: `~${md(a)}` });
      continue;
    }
    if (d2) {
      let b = m2 ? resolve(Number(m2), Number(d2), refDay) : resolve(Number(m1), Number(d2), refDay);
      if (b !== null && b < a) b = m2 ? dayNumber(new Date(b * DAY).getUTCFullYear() + 1, Number(m2), Number(d2)) : null;
      if (b !== null && b - a <= 120) {
        out.push({ start: a, end: b, when: `${md(a)}~${md(b)}` });
        continue;
      }
    }
    out.push({ start: a, end: a, when: deadline ? `${md(a)} 마감` : md(a) });
  }
  return out;
}

/** 오늘 기준 이 날짜의 D-n 기준일: 아직 시작 전이면 시작일, 진행 중이면 끝나는 날, 끝났으면 null */
function keyDay(f: Found, today: number): number | null {
  if (f.start !== null && f.start >= today) return f.start;
  if (f.end !== null && f.end >= today) return f.end;
  return null;
}

export const bare = (title: string) => title.replace(HEAD_PREFIX, "").trim();

const LEAD = /^[\s\p{Extended_Pictographic}\uFE0F\u200D•·\-–—:]+/u;
const STARTS_WITH_DATE = /^~?\s*\d{1,2}\s*(\/|월)/;
const cut = (name: string) => (name.length > 36 ? `${name.slice(0, 35)}…` : name);

/**
 * 행사 칸 하나 "📍 가민 런 코리아 · 11/15(일) 고양…" → "가민 런 코리아".
 * "이름 · …" 꼴이 아니거나(설명 문장), 이름 자리가 날짜로 시작하면("📅 10/31(토)…") 빈 문자열
 */
export function segmentName(seg: string): string {
  const parts = seg.replace(LEAD, "").split(/\s+·\s+/);
  if (parts.length < 2) return "";
  const first = parts[0]!.trim();
  if (!first || STARTS_WITH_DATE.test(first) || /\d{1,2}\s*\/\s*\d{1,2}/.test(first)) return "";
  return cut(first);
}

/** 제목 → 행사 이름: "[행사] 제15회 서울레코드페어 · 10/31(토)~11/1(일) 성수" → "제15회 서울레코드페어", "원두 할인 (~10/31)" → "원두 할인" */
export function titleName(title: string): string {
  const b = bare(title);
  const first = b.split(/\s+·\s+/)[0]!.replace(/\s*\([^)]*\d{1,2}\s*\/\s*\d{1,2}[^)]*\)\s*$/, "").trim();
  return cut(first && !STARTS_WITH_DATE.test(first) ? first : b);
}

/** 본문을 행사 하나씩으로 (📍·🎁 머리표나 줄바꿈) */
export const segments = (body: string) => body.split(/(?=📍|🎁)|\n+/u).map((s) => s.trim()).filter(Boolean);

/**
 * 가까운 일정 최대 n줄. 글마다 행사 칸(📍 …)을 따로 보고, 칸이 없으면 제목의 날짜를 쓴다.
 * 같은 이름은 한 번만, 가까운 순 (D-day 먼저).
 */
export function scheduleLines(posts: readonly SchedulePost[], now = new Date(), n = 3): ScheduleLine[] {
  const today = kstDayNumber(now);
  const cands: (ScheduleLine & { order: number })[] = [];
  let order = 0;
  const add = (post: SchedulePost, name: string, f: Found) => {
    const k = keyDay(f, today);
    if (k === null || k - today > HORIZON_DAYS) return;
    cands.push({ postId: post.id, name, when: f.when, dday: k - today, order: order++ });
  };
  for (const post of posts) {
    const refDay = kstDayNumber(new Date(post.created_at));
    let found = false;
    for (const seg of segments(post.body ?? "")) {
      const name = segmentName(seg);
      if (!name) continue;
      const dates = findDates(seg, refDay);
      const f = dates.find((x) => keyDay(x, today) !== null) ?? dates[0];
      if (!f) continue;
      found = true;
      add(post, name, f);
    }
    if (found) continue;
    // 행사 칸이 없는 글(한 행사 글): 제목의 날짜, 없으면 본문의 날짜
    const nearest = (text: string) =>
      findDates(text, refDay)
        .filter((x) => keyDay(x, today) !== null)
        .sort((a, b) => keyDay(a, today)! - keyDay(b, today)!)[0];
    const f = nearest(bare(post.title)) ?? nearest(post.body ?? "");
    if (f) add(post, titleName(post.title), f);
  }
  cands.sort((a, b) => a.dday - b.dday || a.order - b.order);
  const seen = new Set<string>();
  const out: ScheduleLine[] = [];
  for (const c of cands) {
    const key = c.name.replace(/\s+/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ postId: c.postId, name: c.name, when: c.when, dday: c.dday });
    if (out.length >= n) break;
  }
  return out;
}

/** 날짜를 못 찾으면: 최근 [행사] 글 제목 2개 */
export const latestEventTitles = (posts: readonly SchedulePost[], n = 2): { postId: string; name: string }[] =>
  posts.filter((p) => p.title.startsWith("[행사]")).slice(0, n).map((p) => ({ postId: p.id, name: bare(p.title) }));

export const ddayLabel = (d: number) => (d <= 0 ? "D-day" : `D-${d}`);

/** 글 하나의 일정: 오늘부터 가장 가까운 기준일까지 남은 날, 날짜는 있는데 모두 지났으면 "ended", 날짜를 못 찾으면 null */
export type EventDday = number | "ended" | null;

/**
 * 🎫 행사 카드의 D-day (10/25). 제목의 날짜(운영 글은 제목에 대표 기간을 적는다)와 본문의 날짜 중
 * 아직 안 지난 가장 가까운 기준일 (시작 전이면 시작일, 진행 중이면 끝나는 날). 본문 날짜는 HORIZON_DAYS 안만 본다.
 */
export function eventDday(post: SchedulePost, now = new Date()): EventDday {
  const today = kstDayNumber(now);
  const refDay = kstDayNumber(new Date(post.created_at));
  const title = findDates(bare(post.title), refDay);
  const body = findDates(post.body ?? "", refDay);
  let best: number | null = null;
  for (const [list, horizon] of [[title, Infinity], [body, HORIZON_DAYS]] as const) {
    for (const f of list) {
      const k = keyDay(f, today);
      if (k !== null && k - today <= horizon && (best === null || k < best)) best = k;
    }
  }
  if (best !== null) return best - today;
  return title.length || body.length ? "ended" : null;
}

/** 카드 뱃지 글자: D-day · D-3 · 마감 */
export const eventDdayLabel = (d: EventDday): string | null => (d === null ? null : d === "ended" ? "마감" : ddayLabel(d));

/** 🎫 행사 탭 순서: 가까운 일정 먼저, 날짜 모르는 글은 원래 순서(최신순)대로 그 뒤, 끝난 글은 맨 뒤 */
export function sortByEventDday<T extends { id: string }>(items: readonly T[], ddays: ReadonlyMap<string, EventDday>): T[] {
  const rank = (d: EventDday | undefined) => (typeof d === "number" ? 0 : d === "ended" ? 2 : 1);
  return items
    .map((item, i) => ({ item, i, d: ddays.get(item.id) }))
    .sort((a, b) => rank(a.d) - rank(b.d) || (typeof a.d === "number" && typeof b.d === "number" ? a.d - b.d : 0) || a.i - b.i)
    .map((x) => x.item);
}

/** 행사 이름 (🙋 같이 갈 사람 알림·공유 카드, 10/26): "[행사] 제15회 서울레코드페어 · 10/31(토)~11/1(일) 성수" → "제15회 서울레코드페어" */
export const eventName = (title: string): string => titleName(title);

/**
 * 🙋 행사 기간 (10/26): 제목의 첫 날짜(기간), 제목에 없으면 본문의 첫 날짜. KST 일 번호 {start, end}, 못 찾으면 null.
 * "~10/31" 처럼 마감만 있는 날짜는 행사일로 보지 않는다.
 */
export function eventSpan(post: SchedulePost): { start: number; end: number } | null {
  const refDay = kstDayNumber(new Date(post.created_at));
  const pick = (list: Found[]) => list.find((f) => f.start !== null && f.end !== null && !/마감$/.test(f.when));
  const f = pick(findDates(bare(post.title), refDay)) ?? pick(findDates(post.body ?? "", refDay));
  return f ? { start: f.start!, end: f.end! } : null;
}

/** 일 번호 ↔ "YYYY-MM-DD" */
export const dayIso = (n: number): string => new Date(n * DAY).toISOString().slice(0, 10);
export const isoDayNumber = (s: string): number => Date.parse(`${s}T00:00:00Z`) / DAY;

/** 목록 칩: 제목 말머리가 [행사]/[혜택]이면 그걸로, 아니면 잡담 (홈·검색 목록) */
export function typeChip(title: string, postType: string): string | null {
  if (title.startsWith("[행사]")) return "🎫 행사";
  if (title.startsWith("[혜택]")) return "🎁 혜택";
  return postType === "chat" ? "💬 잡담" : null;
}
