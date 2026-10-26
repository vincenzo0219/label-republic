/**
 * 🙋 같이 갈 사람 (10/26): 서버·화면·테스트 공용 순수 함수. 날짜·시각은 모두 KST.
 * - 갈 거예요: 3명부터 "같이 갈 사람 N명", 공개 닉네임 10개까지 + "외 n명"
 * - 같이 가요 모집(open) / 자동 조 편성(auto, 4~6명, 성인·청소년은 섞지 않음)
 * - 조 채팅의 연락처 가림, 도착 확인 창, 노쇼 제한
 * 1:1 매칭은 하지 않는다 (모집 정원 2~6, 자동 조 4~6).
 */
import { FALLBACK_POINT, type MeetPoint, type Venue } from "./venues";
import { dayIso, eventDday, eventDdayLabel, eventName, eventSpan } from "./adSchedule";

const DAY = 86_400_000;
const KST = 9 * 3600_000;
const MIN = 60_000;

export const GOING_SHOW_MIN = 3;
export const GOING_NAMES_MAX = 10;
export const GROUPS_SHOW_MIN = 3;
export const REPORT_HIDE = 3;
export const AUTO_MIN = 4;
export const AUTO_MAX = 6;
export const OPEN_CAP_MIN = 2;
export const OPEN_CAP_MAX = 6;

export const SAFETY_NOTE = "첫 만남은 사람 많은 곳에서. 선입금·개인 연락처 요구는 주의하세요.";
export const CONTACT_HINT = "연락처 대신 여기서 이야기해요";
export const NOSHOW_RULE = "노쇼하면 30일 동안 조 신청이 안 돼요. D-1 18시까지는 언제든 취소 가능";
export const SLOT_LABEL = { am: "오전", pm: "오후" } as const;
export const AGE_LABEL = { adult: "성인", teen: "청소년(만 14~18)" } as const;
export type Slot = keyof typeof SLOT_LABEL;
export type Age = keyof typeof AGE_LABEL;

/** "같이 갈 사람 N명": 3명 미만이면 아무것도 보이지 않는다 (가짜 숫자·빈 숫자 없이) */
export function goingDisplay(count: number, publicNames: readonly string[]): { label: string; names: string[]; more: number } | null {
  if (count < GOING_SHOW_MIN) return null;
  const names = publicNames.slice(0, GOING_NAMES_MAX);
  return { label: `같이 갈 사람 ${count}명`, names, more: names.length ? count - names.length : 0 };
}

/** "이번 행사 조 n개 편성됨": 3개부터 */
export const groupsProof = (n: number): string | null => (n >= GROUPS_SHOW_MIN ? `이번 행사 조 ${n}개 편성됨` : null);

/**
 * 한 묶음(같은 날짜·시간대·나이대) n명을 4~6명 조로. 조 크기는 고르게, 4명이 안 되는 나머지는 다른 조에 넣을 자리(6명까지)가
 * 있으면 넣고(고르게 나누면 자연히 그렇게 된다) 없으면 조 없음.
 * 반환: 조 크기들(큰 조 먼저)과 남는 인원.
 */
export function planGroupSizes(n: number): { sizes: number[]; leftover: number } {
  let k = Math.ceil(n / AUTO_MAX);
  while (k > 0 && Math.floor(n / k) < AUTO_MIN) k--;
  if (k === 0) return { sizes: [], leftover: n };
  const matched = Math.min(n, k * AUTO_MAX);
  const base = Math.floor(matched / k);
  const extra = matched % k;
  return { sizes: Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0)), leftover: n - matched };
}

export type PoolEntry = { id: string; day: string; slot: Slot; age: Age; created_at: string | Date };
export type PlannedGroup = { day: string; slot: Slot; age: Age; ids: string[] };

/** 신청 순서대로 묶음마다 조를 짠다. 늦게 신청한 사람이 남는다 */
export function buildAutoGroups(entries: readonly PoolEntry[]): { groups: PlannedGroup[]; unmatched: string[] } {
  const buckets = new Map<string, PoolEntry[]>();
  for (const e of [...entries].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at) || Number(a.id) - Number(b.id))) {
    const k = `${e.day}|${e.slot}|${e.age}`;
    buckets.set(k, [...(buckets.get(k) ?? []), e]);
  }
  const groups: PlannedGroup[] = [];
  const unmatched: string[] = [];
  for (const k of [...buckets.keys()].sort()) {
    const list = buckets.get(k)!;
    const { sizes } = planGroupSizes(list.length);
    let i = 0;
    for (const size of sizes) {
      const part = list.slice(i, i + size);
      groups.push({ day: part[0]!.day, slot: part[0]!.slot, age: part[0]!.age, ids: part.map((e) => e.id) });
      i += size;
    }
    unmatched.push(...list.slice(i).map((e) => e.id));
  }
  return { groups, unmatched };
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const minutesOf = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h! * 60 + m!;
};

/** 글에 적힌 오픈 시각 ("10:00 오픈", "오전 10시 개장", "10시부터 입장") → 분. 없으면 null */
export function parseOpening(text: string): number | null {
  const m = /(?:(오전|오후)\s*)?(\d{1,2})(?::(\d{2})|\s*시(?:\s*(\d{1,2})\s*분)?)\s*(?:부터\s*)?(?:오픈|개장|입장|open)/i.exec(text);
  if (!m) return null;
  let h = Number(m[2]);
  const min = Number(m[3] ?? m[4] ?? 0);
  if (m[1] === "오후" && h < 12) h += 12;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export const AM_DEFAULT = "09:40";
export const PM_DEFAULT = "13:40";

/** 만날 시각: 오전 조는 오픈 20분 전(오픈이 오전일 때만), 아니면 09:40. 오후 조는 13:40 */
export function meetTime(slot: Slot, opening: number | null): string {
  if (slot === "pm") return PM_DEFAULT;
  if (opening !== null && opening - 20 >= 6 * 60 && opening < 12 * 60) return hhmm(opening - 20);
  return AM_DEFAULT;
}

/**
 * 같은 날짜·시간대 조가 여럿이면 만날 곳을 돌아가며 나누고, 곳보다 조가 많으면 10분씩 늦춘다 (사람이 한데 몰려 서로 못 찾지 않게).
 * i: 그 날짜·시간대 안에서 몇 번째 조(0부터)
 */
export function spreadPlace(venue: Venue | null, base: string, i: number): { point: MeetPoint; time: string } {
  const points = venue?.points.length ? venue.points : [FALLBACK_POINT];
  const point = points[i % points.length]!;
  const time = hhmm(minutesOf(base) + 10 * Math.floor(i / points.length));
  return { point, time };
}

/** "3조 · 삼성역 5·6번 출구 코엑스 연결통로 입구 · 09:40 · 삼성역" */
export const placeLine = (g: { seq?: number | null; place: string; meet_time: string; station?: string | null }) =>
  [g.seq ? `${g.seq}조` : null, g.place, g.meet_time, g.station].filter(Boolean).join(" · ");

/** 지도 링크를 붙일 만한 곳인지 (막연한 "행사장 공식 입구 앞" 은 검색해도 엉뚱한 곳이 나온다) */
export const mappable = (place: string) => place !== FALLBACK_POINT.name;

// ---------------------------------------------------------------------------
// 시각
// ---------------------------------------------------------------------------

/** "YYYY-MM-DD" + "HH:MM" (KST) → Date */
export function kstAt(day: string, time = "00:00"): Date {
  const [y, mo, d] = day.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return new Date(Date.UTC(y!, mo! - 1, d!, h!, mi!) - KST);
}

/** 무료 취소 마감: 전날 18:00 */
export const freeCancelUntil = (day: string) => new Date(kstAt(day, "18:00").getTime() - DAY);
/** 자동 조 채팅은 전날 0시에 열린다 */
export const chatOpensAt = (day: string) => new Date(kstAt(day).getTime() - DAY);
export const CHECKIN_MARGIN_MS = 30 * MIN;
/** 도착 확인 창: 만날 시각 30분 전 ~ 30분 뒤 */
export function checkinWindow(day: string, time: string): { from: Date; to: Date } {
  const t = kstAt(day, time).getTime();
  return { from: new Date(t - CHECKIN_MARGIN_MS), to: new Date(t + CHECKIN_MARGIN_MS) };
}
export const inCheckin = (day: string, time: string, now: Date) => {
  const w = checkinWindow(day, time);
  return now >= w.from && now <= w.to;
};
export const chatOpen = (g: { kind: string; day: string }, now: Date) => g.kind !== "auto" || now >= chatOpensAt(g.day);

/** KST 오늘 "YYYY-MM-DD" */
export const kstToday = (now = new Date()) => new Date(now.getTime() + KST).toISOString().slice(0, 10);
export const kstHour = (now = new Date()) => (now.getUTCHours() + 9) % 24;
export const quietHours = (now = new Date()) => {
  const h = kstHour(now);
  return h < 8 || h >= 22;
};

/** 모집 마감: 정원이 찼거나 그날이 지났으면 */
export const groupClosed = (g: { member_count: number; capacity: number; day: string }, now = new Date()) =>
  g.member_count >= g.capacity || g.day < kstToday(now);

/** 행사 시작 며칠 전인지 (dStart: 시작일 일 번호) */
const dayNo = (now: Date) => Math.floor((now.getTime() + KST) / DAY);
/** 조 신청은 D-3 12시 전까지 */
export const poolOpen = (startDay: number, now = new Date()) => {
  const left = startDay - dayNo(now);
  return left > 3 || (left === 3 && kstHour(now) < 12);
};
/** D-3 12시부터 조를 짠다 (늦게 돌았으면 행사 전날까지 따라잡는다) */
export const poolDue = (startDay: number, now = new Date()) => {
  const left = startDay - dayNo(now);
  return left >= 0 && (left < 3 || (left === 3 && kstHour(now) >= 12));
};
/** 3일 전 알림: 시작 3일 전 KST 19시~22시 */
export const reminderDue = (startDay: number, now = new Date()) => startDay - dayNo(now) === 3 && kstHour(now) >= 19 && kstHour(now) < 22;
/** 끝난 다음 날부터 "다녀오셨으면 방에 후기" */
export const afterEvent = (endDay: number, now = new Date()) => dayNo(now) > endDay;

// ---------------------------------------------------------------------------
// 도착·노쇼
// ---------------------------------------------------------------------------

export type MemberState = { id: string; left_at: string | Date | null; late_cancel: boolean; checked_in: boolean; geo_ok: boolean; confirms: number };
export type Outcome = "attended" | "noshow" | "late_cancel" | "excused";

/**
 * 도착 확인 창이 끝난 뒤 결과. 스스로 도착(+500m 안) 또는 다른 조원 1명 이상 "만났어요" = 다녀옴.
 * 조 전체에 도착 확인이 하나도 없으면(기능을 안 썼거나 행사가 바뀜) 아무도 제한하지 않는다.
 * 무료 취소 마감 전에 나간 사람은 결과 없음(null).
 */
export function settleOutcomes(members: readonly MemberState[]): { id: string; outcome: Outcome | null }[] {
  const any = members.some((m) => m.checked_in || m.confirms > 0);
  return members.map((m) => {
    if (m.left_at) return { id: m.id, outcome: m.late_cancel ? (any ? "late_cancel" : "excused") : null };
    if (!any) return { id: m.id, outcome: "excused" };
    const ok = (m.checked_in && m.geo_ok) || m.confirms >= 1;
    return { id: m.id, outcome: ok ? "attended" : "noshow" };
  });
}

export const PENALTY_WINDOW_DAYS = 90;
/** 기록(취소되지 않은 노쇼·늦은 취소 시각) → 다시 신청할 수 있는 때. 1회 30일, 90일 안 2회 이상 90일. 이미 지났으면 null */
export function penaltyUntil(strikes: readonly (string | Date)[], now = new Date()): Date | null {
  const recent = strikes.map((s) => new Date(s)).filter((d) => now.getTime() - d.getTime() < PENALTY_WINDOW_DAYS * DAY).sort((a, b) => b.getTime() - a.getTime());
  if (!recent.length) return null;
  const until = new Date(recent[0]!.getTime() + (recent.length >= 2 ? 90 : 30) * DAY);
  return until > now ? until : null;
}

/** "다음 조 신청은 11/26부터 가능해요" */
export function penaltyText(until: Date): string {
  const k = new Date(until.getTime() + KST);
  return `다음 조 신청은 ${k.getUTCMonth() + 1}/${k.getUTCDate()}부터 가능해요`;
}

export const KEEP_BADGE_MIN = 2;
export const keepBadge = (attended: number) => (attended >= KEEP_BADGE_MIN ? `🤝 약속 지킴 ${attended}회` : null);

/** 글 본문의 첫 공식·예매 링크 (출처 목록이 없을 때) */
export function firstOfficialUrl(body: string): string | null {
  for (const m of body.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) {
    const u = m[0].replace(/[.,!?]+$/, "");
    if (/open\.kakao\.com|t\.me\/|instagram\.com\/p\/|youtu/i.test(u)) continue;
    return u;
  }
  return null;
}

const mdOf = (n: number) => {
  const d = dayIso(n);
  return `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
};

/** 공유 카드 내용: 행사명 · 날짜 · D-day · "같이 갈 사람 N명"(3명부터만) */
export function eventCardData(p: { id: string; title: string; body: string; created_at: string | Date; room: string }, going: number, now = new Date()) {
  const span = eventSpan(p);
  return {
    id: p.id,
    room: p.room,
    name: eventName(p.title),
    when: span ? (span.start === span.end ? mdOf(span.start) : `${mdOf(span.start)}~${mdOf(span.end)}`) : null,
    dday: eventDdayLabel(eventDday(p, now)),
    going: goingDisplay(going, [])?.label ?? null,
  };
}
