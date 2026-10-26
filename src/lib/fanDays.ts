/**
 * 🎉 나만의 덕질 기념일 (10/26) — 입덕일·첫 직관 같은 날짜를 이 브라우저(localStorage)에만 최대 5개. 날짜는 서버에 보내지 않는다.
 * 대표님 "어차피 글을 안 쓰니까 아주 쉽게": 고르기만 한다 (방 · 종류 · 날짜 · 닉네임). 방에 올리는 카드는 정해진 틀로 서버가 만든다.
 * 세는 법 (대표님 10/26): 등록한 날짜 그날이 1일째 (다음 날 = 2일째). 그래서 10일째 = 날짜 + 9일, 100일째 = 날짜 + 99일.
 * 기념일: 입덕일·첫 직관·첫 참가·시작한 날은 1일·10일·100일·200일·300일… (100일마다, 끝 없음). 주년은 따로 없다.
 * 최애 생일은 해마다 그 월/일 (2/29 는 평년에 2/28). 모든 종류에 등록한 날 카드 한 장.
 * 서버·브라우저·테스트 공용 순수 함수. 날짜는 KST 달력 기준 일 번호 (src/lib/adSchedule.ts 의 kstDayNumber).
 */
import { dayIso, isoDayNumber, kstDayNumber } from "./adSchedule";
import { buildIcs, shortHash, type IcsEvent } from "./ics";

export const FAN_DAYS_KEY = "nb:fanDays";
export const FAN_DAYS_MAX = 5;
export const FAN_DAYS_EVENT = "nb:fanDays-changed";

/** 기념일 종류 (자유 입력 없음) */
export const FAN_PRESETS = [
  { key: "ipduk", label: "입덕일" },
  { key: "first", label: "첫 직관·첫 참가" },
  { key: "bday", label: "최애 생일" },
  { key: "start", label: "시작한 날" },
] as const;
export type FanPreset = (typeof FAN_PRESETS)[number]["key"];
export const isFanPreset = (v: unknown): v is FanPreset => FAN_PRESETS.some((p) => p.key === v);
export const presetLabel = (p: FanPreset): string => FAN_PRESETS.find((x) => x.key === p)!.label;

export type FanDay = { id: string; preset: FanPreset; date: string; room: string };
/** days: n일째 (1·10·100·200…) · bday: 최애 생일 (n = 그해) */
export type Milestone = { kind: "days" | "bday"; n: number; day: number; dday: number };
/** 카드 한 장의 날: n일째 · 오늘 최애 생일 · 최애 생일까지 n일 (등록한 날) */
export type Occasion = { unit: "days"; n: number } | { unit: "bday" } | { unit: "until"; n: number };

type Store = Pick<Storage, "getItem" | "setItem">;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_RE = /^[\p{L}\p{N}-]{1,60}$/u;
const DAY = 86_400_000;

/** "2024-02-30" 같은 없는 날짜는 거른다 */
export function validIso(s: string): boolean {
  if (!ISO_RE.test(s)) return false;
  const n = isoDayNumber(s);
  return Number.isFinite(n) && dayIso(n) === s;
}

function clean(v: unknown): FanDay[] {
  if (!Array.isArray(v)) return [];
  const out: FanDay[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const { id, preset, date, room } = x as Record<string, unknown>;
    if (typeof id !== "string" || !/^[0-9a-z]{1,40}$/.test(id) || !isFanPreset(preset) || typeof date !== "string" || !validIso(date)) continue;
    if (typeof room !== "string" || !SLUG_RE.test(room) || out.some((o) => o.id === id)) continue;
    out.push({ id, preset, date, room });
  }
  return out.slice(0, FAN_DAYS_MAX);
}

function store(s?: Store | null): Store | null {
  if (s !== undefined) return s;
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readJson(key: string, s?: Store | null): unknown {
  const st = store(s);
  if (!st) return null;
  try {
    return JSON.parse(st.getItem(key) ?? "null") as unknown;
  } catch {
    return null;
  }
}

function writeJson(key: string, v: unknown, s?: Store | null): boolean {
  const st = store(s);
  if (!st) return false;
  try {
    st.setItem(key, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

const changed = () => {
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(FAN_DAYS_EVENT));
  } catch {}
};

/** 저장된 기념일 (못 읽거나 깨졌으면 빈 목록) */
export const getFanDays = (s?: Store | null): FanDay[] => clean(readJson(FAN_DAYS_KEY, s));

/** 추가: "full"(5개 참) · "invalid" · "nostore"(저장 못 함) 아니면 새 기념일 */
export function addFanDay(item: Omit<FanDay, "id">, s?: Store | null, id = Date.now().toString(36)): FanDay | "full" | "invalid" | "nostore" {
  const cur = getFanDays(s);
  if (cur.length >= FAN_DAYS_MAX) return "full";
  const next: FanDay = { id, preset: item.preset, date: item.date, room: item.room };
  if (!clean([next]).length) return "invalid";
  if (!writeJson(FAN_DAYS_KEY, [...cur, next], s)) return "nostore";
  changed();
  return next;
}

export function removeFanDay(id: string, s?: Store | null): void {
  writeJson(FAN_DAYS_KEY, getFanDays(s).filter((x) => x.id !== id), s);
  changed();
}

/** n일째 (시작한 날 = 1일째). 아직 오지 않은 날이면 0 이하 (-2 = 사흘 뒤 시작) */
export function dayCount(date: string, now = new Date()): number {
  return kstDayNumber(now) - isoDayNumber(date) + 1;
}

/** 이 n일째가 기념일인가: 1일 · 10일 · 100일 단위 */
export const isMilestoneDay = (n: number): boolean => n === 1 || n === 10 || (n >= 100 && n % 100 === 0);

/** n일째 날의 일 번호 (n = 1 이 등록한 날짜) */
export const nthDay = (date: string, n: number): number => isoDayNumber(date) + n - 1;

/** 그해의 생일 (2/29 는 평년에 2/28) */
function birthdayIn(date: string, year: number): number {
  const [, mm, dd] = date.split("-").map(Number) as [number, number, number];
  const last = new Date(Date.UTC(year, mm, 0)).getUTCDate();
  return Date.UTC(year, mm - 1, Math.min(dd, last)) / DAY;
}

/** 최애 생일: 오늘이거나 다음 생일 (오늘이면 dday 0) */
export function nextBirthday(date: string, now = new Date()): { day: number; dday: number; year: number } {
  const today = kstDayNumber(now);
  let year = new Date(today * DAY).getUTCFullYear();
  let d = birthdayIn(date, year);
  if (d < today) d = birthdayIn(date, ++year);
  return { day: d, dday: d - today, year };
}

/** 오늘이거나 다음에 오는 기념일 count 개 (가까운 순) */
export function nextMilestones(f: Pick<FanDay, "preset" | "date">, now = new Date(), count = 2): Milestone[] {
  const today = kstDayNumber(now);
  const out: Milestone[] = [];
  if (f.preset === "bday") {
    let { year } = nextBirthday(f.date, now);
    while (out.length < count) {
      const day = birthdayIn(f.date, year++);
      out.push({ kind: "bday", n: year - 1, day, dday: day - today });
    }
    return out;
  }
  const c = dayCount(f.date, now);
  // 1 · 10 · 100 · 200 … 중 오늘(c일째) 이후 첫 번째부터
  let n = c <= 1 ? 1 : c <= 10 ? 10 : Math.ceil(c / 100) * 100;
  while (out.length < count) {
    const day = nthDay(f.date, n);
    out.push({ kind: "days", n, day, dday: day - today });
    n = n === 1 ? 10 : n === 10 ? 100 : n + 100;
  }
  return out;
}

/**
 * 오늘 올릴 수 있는 카드. 등록한 날(registering)은 한 장 (n일째, 생일은 오늘이 생일이 아니면 "생일까지 n일").
 * 그 뒤에는 기념일(1·10·100일 단위, 생일) 당일만. 아직 시작 전이면 null.
 */
export function todayOccasion(f: Pick<FanDay, "preset" | "date">, now = new Date(), registering = false): Occasion | null {
  if (f.preset === "bday") {
    const d = nextBirthday(f.date, now).dday;
    return d === 0 ? { unit: "bday" } : registering ? { unit: "until", n: d } : null;
  }
  const n = dayCount(f.date, now);
  if (n < 1) return null;
  return isMilestoneDay(n) || registering ? { unit: "days", n } : null;
}

export const occasionKey = (o: Occasion): string => (o.unit === "bday" ? "bday" : `${o.unit}${o.n}`);

/** "1일" · "100일" · "1,000일" · "최애 생일" */
export const milestoneLabel = (m: Milestone): string => (m.kind === "bday" ? "최애 생일" : `${m.n.toLocaleString("ko-KR")}일`);

export const ddayText = (d: number): string => (d === 0 ? "오늘!" : `D-${d}`);

/** 카드·화면 문구의 기념일 이름: "입덕" · "첫 직관·참가" · "러닝 시작" · "최애 생일" */
export function presetPhrase(p: FanPreset, roomShort: string): string {
  return p === "ipduk" ? "입덕" : p === "first" ? "첫 직관·참가" : p === "start" ? `${roomShort} 시작` : "최애 생일";
}

/** 화면에 보이는 오늘 숫자: "입덕 1,234일째" · "최애 생일 D-12" · "입덕 D-3" */
export function countText(f: Pick<FanDay, "preset" | "date">, roomShort: string, now = new Date()): string {
  const phrase = presetPhrase(f.preset, roomShort);
  if (f.preset === "bday") {
    const d = nextBirthday(f.date, now).dday;
    return d === 0 ? `오늘은 ${phrase}!` : `${phrase} D-${d}`;
  }
  const n = dayCount(f.date, now);
  return n >= 1 ? `${phrase} ${n.toLocaleString("ko-KR")}일째` : `${phrase} D-${1 - n}`;
}

/** 방에 올라가는 카드 제목 (서버가 만든다): "🎉 하늘하늘님 러닝 시작 100일째" · "🎂 오늘 하늘하늘님 최애 생일" */
export function cardTitle(nick: string, preset: FanPreset, roomShort: string, o: Occasion): string {
  if (o.unit === "bday") return `🎂 오늘 ${nick}님 최애 생일`;
  if (o.unit === "until") return `🎂 ${nick}님 최애 생일까지 ${o.n.toLocaleString("ko-KR")}일`;
  return `🎉 ${nick}님 ${presetPhrase(preset, roomShort)} ${o.n.toLocaleString("ko-KR")}일째`;
}

/** 카드 본문 (정해진 틀, 자유 입력 없음) */
export function cardBody(nick: string, preset: FanPreset, roomShort: string, o: Occasion): string {
  if (o.unit === "bday") return `오늘은 ${nick}님 최애의 생일이에요.\n🎉 축하해요 버튼으로 같이 축하해 주세요.`;
  if (o.unit === "until") return `${nick}님 최애의 생일이 ${o.n.toLocaleString("ko-KR")}일 남았어요.\n🎉 축하해요 버튼으로 미리 축하해 주세요.`;
  return `오늘은 ${nick}님의 ${presetPhrase(preset, roomShort)} ${o.n.toLocaleString("ko-KR")}일째예요.\n🎉 축하해요 버튼으로 같이 축하해 주세요.`;
}

/** 닉네임이 없을 때 쓰는 친근한 이름: "반짝이는 덕후 27" */
const ADJ = ["반짝이는", "행복한", "씩씩한", "다정한", "신나는", "든든한", "포근한", "용감한"];
export const friendlyNickname = (r: number): string => {
  const k = Math.abs(Math.floor(r));
  return `${ADJ[k % ADJ.length]} 덕후 ${(Math.floor(k / ADJ.length) % 90) + 10}`;
};

/**
 * "달력에도 넣기": 기념일마다 다가오는 기념일 (1·10·100일 단위는 4개, 최애 생일은 3번)을 하루 종일 일정으로 (전날 09:00 알림).
 * 브라우저에서 파일로 만들어 내려받는다 (서버에 날짜를 보내지 않음).
 */
export function fanDaysIcs(list: readonly FanDay[], room: (slug: string) => { name: string; short: string }, siteUrl: string, now = new Date()): string {
  const events: IcsEvent[] = [];
  for (const f of list) {
    const r = room(f.room);
    const phrase = presetPhrase(f.preset, r.short);
    const url = `${siteUrl}/c/${encodeURIComponent(f.room)}`;
    for (const m of nextMilestones(f, now, f.preset === "bday" ? 3 : 4))
      events.push({
        uid: `fanday-${shortHash(`${f.id}|${f.preset}|${f.date}|${f.room}`)}-${m.kind}${m.n}@nobangjang.com`,
        summary: m.kind === "bday" ? `🎂 ${phrase}` : `🎉 ${phrase} ${m.n.toLocaleString("ko-KR")}일째`,
        description: `${presetLabel(f.preset)} ${f.date} · ${r.name}\n${url}`,
        url,
        allDay: { start: m.day, end: m.day },
        alarm: true,
      });
  }
  return buildIcs({ name: "노방장 · 내 덕질 기념일", events, now });
}

export const todayIso = (now = new Date()): string => dayIso(kstDayNumber(now));

// ---------------------------------------------------------------------------
// 🎉 축하해요 · 💪 응원해요 (10/26 대표님 "서로 덕질 기념일 축하하는거 아주 쉽게, 버튼 하나로")
// ---------------------------------------------------------------------------
export const reactionLabel = (kind: "fanday" | "cheer", mine: boolean): string =>
  kind === "cheer" ? (mine ? "💪 응원했어요" : "💪 응원해요") : mine ? "🎉 축하했어요" : "🎉 축하해요";

export const reactionCountText = (kind: "fanday" | "cheer", n: number): string =>
  n > 0 ? `${kind === "cheer" ? "💪" : "🎉"} ${n.toLocaleString("ko-KR")}명이 ${kind === "cheer" ? "응원했어요" : "축하했어요"}` : kind === "cheer" ? "첫 응원을 보내 주세요" : "첫 축하를 보내 주세요";

/** 카드 주인 알림 문구 */
export const cheerPushTitle = (n: number): string => `🎉 ${n.toLocaleString("ko-KR")}명이 내 덕질 기념일을 축하했어요`;

const POSTS_KEY = "nb:fanDayPosts";
const CHEERED_KEY = "nb:cheered";

export type PostedCard = { postId: string; occ: string; day: string };

/** 올린 카드 (기념일 id → 마지막 카드). 내 카드에 축하 수를 보여 주고, 같은 날 같은 카드를 두 번 올리지 않게 */
export function fanDayPosts(s?: Store | null): Record<string, PostedCard> {
  const v = readJson(POSTS_KEY, s);
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, PostedCard> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const c = x as Partial<PostedCard> | null;
    if (c && typeof c.postId === "string" && /^\d{1,18}$/.test(c.postId) && typeof c.occ === "string" && typeof c.day === "string") out[k] = { postId: c.postId, occ: c.occ, day: c.day };
  }
  return out;
}

export function rememberFanDayPost(fanDayId: string, card: PostedCard, s?: Store | null): void {
  if (!/^\d{1,18}$/.test(card.postId)) return;
  const cur = fanDayPosts(s);
  delete cur[fanDayId];
  writeJson(POSTS_KEY, Object.fromEntries([...Object.entries(cur), [fanDayId, card]].slice(-20)), s);
  changed();
}

/** 이 기기에서 누른 카드 (화면 표시용. 실제 중복 막기는 서버가 방문자 쿠키로) */
export function cheeredPosts(s?: Store | null): string[] {
  const v = readJson(CHEERED_KEY, s);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(-200) : [];
}

export function rememberCheer(postId: string, s?: Store | null): void {
  writeJson(CHEERED_KEY, [...cheeredPosts(s).filter((x) => x !== postId), postId].slice(-200), s);
}
