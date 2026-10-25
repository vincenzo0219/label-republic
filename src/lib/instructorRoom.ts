/**
 * 🧘 요가·필라테스 강사방 (10/25 운영자 승인). 핵심은 📋 대강·구인 게시판: 카톡 대강방보다 찾기 쉽게.
 * - 구조화된 글(지역·날짜/요일·시간·수업·페이·연락처) · 카톡 글 붙여넣기 → 칸 채우기(src/lib/gigParse.ts)
 * - 지역·날짜·수업 거르기 · 날짜 지난 대강은 목록에서 빠짐(DB 에는 남음) · 글쓴이가 "마감"
 * - 연락처는 상세 화면에서 버튼을 눌러야 보인다 (목록·OG·검색에 안 나감)
 * - 🔔 지역·수업 알림 (src/lib/jobs/gigPush.ts)
 * 서버·클라이언트 공용 순수 함수.
 */
import { z } from "zod";
import regions from "@/data/kr-regions.json";

export const INSTRUCTOR_ROOM = "요가-필라테스-강사방";
export const INSTRUCTOR_ROOM_NAME = "🧘 요가·필라테스 강사방";
/** 방 탭 키 (?tab=gigs). 이 방은 탭 없이 들어와도 이 화면 */
export const GIG_TAB = "gigs";
export const GIG_TAB_LABEL = "📋 대강·구인";
export const isInstructorRoom = (slug: string | null | undefined): boolean => slug === INSTRUCTOR_ROOM;
export const BOARD_PATH = `/c/${encodeURIComponent(INSTRUCTOR_ROOM)}`;

export const GIG_KINDS = { sub: "대강", regular: "정규 구인" } as const;
export type GigKind = keyof typeof GIG_KINDS;

export const CLASS_TYPES = ["매트필라테스", "기구필라테스", "요가", "플라잉", "바레", "줌바·댄스", "기타"] as const;
export type ClassType = (typeof CLASS_TYPES)[number];

export const EQUIPMENT = ["리포머", "캐딜락", "캐포머", "체어", "바렐", "콤비", "스프링보드", "소도구"] as const;

export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

// ---------------------------------------------------------------------------
// 지역: 시·도 짧은 이름 + 시·군·구 (경기·도는 시·군까지). 알림 구독은 "서울"(시·도 전체) 또는 "서울 마포구"
// ---------------------------------------------------------------------------
export type Region = { name: string; short: string; metro: boolean; districts: string[] };
export const REGIONS = regions as Region[];
export const SIDOS: readonly string[] = REGIONS.map((r) => r.short);
export const districtsOf = (sido: string): string[] => REGIONS.find((r) => r.short === sido)?.districts ?? [];
export const isValidRegion = (sido: string, sigungu: string): boolean =>
  SIDOS.includes(sido) && (sigungu === "" || districtsOf(sido).includes(sigungu));
/** 알림 지역 값: "서울" 또는 "서울 마포구" */
export function isValidArea(v: string): boolean {
  const [sido, sigungu = "", extra] = v.split(" ");
  return !extra && !!sido && isValidRegion(sido, sigungu);
}
export const regionLabel = (sido: string, sigungu: string) => [sido, sigungu].filter(Boolean).join(" ");
export const areaMatches = (area: string, sido: string, sigungu: string) => area === sido || area === `${sido} ${sigungu}`;

// ---------------------------------------------------------------------------
// 날짜 (KST)
// ---------------------------------------------------------------------------
const KST = 9 * 3600_000;
export const kstYmd = (d: Date): string => new Date(d.getTime() + KST).toISOString().slice(0, 10);
export const kstDow = (d: Date): number => new Date(d.getTime() + KST).getUTCDay();
export const kstHm = (d: Date): string => new Date(d.getTime() + KST).toISOString().slice(11, 16);
export const addDays = (ymd: string, n: number): string => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const dowOf = (ymd: string): number => new Date(`${ymd}T00:00:00Z`).getUTCDay();
/** 'YYYY-MM-DD' → '10/27(화)' */
export const mdLabel = (ymd: string): string => {
  const d = new Date(`${ymd}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEKDAYS[d.getUTCDay()]})`;
};
/** 이번 주 일요일 (오늘이 일요일이면 오늘) */
export const weekEnd = (today: string): string => addDays(today, (7 - dowOf(today)) % 7);

/** 정규 구인은 올린 뒤 이만큼 보인다 (다시 올리면 새로) */
export const REGULAR_DAYS = 30;
/** 같은 글 다시 올리기 막는 시간 */
export const DUP_WINDOW_MS = 24 * 3600_000;
export const DUP_MESSAGE = "이미 올라가 있어요, 끌어올리기 대신 그대로 노출돼요";

// ---------------------------------------------------------------------------
// 글 입력
// ---------------------------------------------------------------------------
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const text = (max: number) => z.string().trim().max(max).default("");

export const gigInputSchema = z.object({
  nickname: z.string().trim().min(2).max(20),
  pw: z.string().regex(/^\d{4}$/),
  kind: z.enum(["sub", "regular"]),
  studio: text(60),
  sido: z.string().max(10),
  sigungu: text(20),
  station: text(20),
  address: text(120),
  dates: z.array(ymd).max(14).default([]),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  times: z.array(hm).max(12).default([]),
  classType: z.enum(CLASS_TYPES),
  equipment: z.array(z.enum(EQUIPMENT)).max(8).default([]),
  pay: z.number().int().min(0).max(1_000_000).nullable().default(null),
  tax: z.boolean().nullable().default(null),
  payday: text(60),
  contact: z.string().trim().min(4).max(160),
  notes: text(1000),
  /** 붙여넣은 카톡 글 (같은 글 다시 올리기 판단에만, 저장하지 않음) */
  raw: text(4000),
});
export type GigInput = z.infer<typeof gigInputSchema>;

/** 게시판 글로 받을 수 있는지 (정치·잡담 글은 여기서 걸러진다): 날짜 또는 요일 + 수업 + 지역 */
export function gigProblem(g: Pick<GigInput, "kind" | "sido" | "sigungu" | "dates" | "weekdays" | "classType" | "contact">, today: string): string | null {
  if (!isValidRegion(g.sido, g.sigungu)) return "지역(시·도)을 골라 주세요";
  if (g.kind === "sub" && g.dates.length === 0) return "대강 날짜를 넣어 주세요";
  if (g.kind === "regular" && g.weekdays.length === 0 && g.dates.length === 0) return "수업 요일을 골라 주세요";
  if (g.dates.some((d) => d < today)) return "지난 날짜는 넣을 수 없어요";
  if (g.dates.some((d) => d > addDays(today, 180))) return "날짜는 반년 안으로 넣어 주세요";
  if (!/\d{3,}|@|[a-z]{3,}/i.test(g.contact)) return "연락처(전화·카톡·이메일)를 넣어 주세요";
  return null;
}

/** 공개 목록에서 빠지는 날 (이날까지 보임): 대강은 마지막 날짜, 정규는 올린 날 + 30일 (날짜가 있으면 그중 늦은 날) */
export function expiresOn(kind: GigKind, dates: readonly string[], today: string): string {
  const last = [...dates].sort().pop();
  if (kind === "sub") return last ?? today;
  const base = addDays(today, REGULAR_DAYS);
  return last && last > base ? last : base;
}

/** 같은 글인지 비교하는 열쇠: 숫자·글자만, 공백·기호·이모지 없이 */
export function dupText(s: string): string {
  return s.normalize("NFC").toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
}

/** 두 글이 거의 같은지: 짧은 쪽 기준 2-gram 겹침 90% 이상 */
export function nearlySame(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const grams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1);
    return m;
  };
  const [ga, gb] = [grams(a), grams(b)];
  let common = 0;
  for (const [k, n] of ga) common += Math.min(n, gb.get(k) ?? 0);
  const total = Math.min(a.length, b.length) - 1;
  return total > 0 && common / total >= 0.9 && Math.abs(a.length - b.length) / Math.max(a.length, b.length) < 0.2;
}

/** 연락처의 숫자만 (같은 센터인지 볼 때) */
export const contactKey = (c: string): string => {
  const phone = /01[016789]\D?\d{3,4}\D?\d{4}|0\d{1,2}\D?\d{3,4}\D?\d{4}/.exec(c)?.[0];
  if (phone) return phone.replace(/\D/g, "");
  return c.trim().toLowerCase().replace(/\s/g, "").slice(0, 80);
};

/** "35000" → "3.5만" */
export function payLabel(pay: number | null): string {
  if (!pay) return "페이 협의";
  const man = pay / 10000;
  return `${Number.isInteger(man) ? man : Math.round(man * 100) / 100}만`;
}

/** 요일 [1,3,5] → "월·수·금" */
export const weekdayLabel = (w: readonly number[]): string => [...w].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WEEKDAYS[d]).join("·");

/** 목록 카드 한 줄 날짜: 대강은 날짜들, 정규는 매주 요일 */
export function whenLabel(g: { kind: GigKind; dates: readonly string[]; weekdays: readonly number[] }): string {
  if (g.dates.length) {
    const s = [...g.dates].sort();
    return s.length > 3 ? `${s.slice(0, 3).map(mdLabel).join(", ")} 외 ${s.length - 3}일` : s.map(mdLabel).join(", ");
  }
  return g.weekdays.length ? `매주 ${weekdayLabel(g.weekdays)}` : "";
}

/** 당일 급구: 대강이고 오늘 수업이 아직 남았다 */
export function isUrgent(g: { kind: GigKind; dates: readonly string[]; times: readonly string[] }, now: Date): boolean {
  if (g.kind !== "sub" || !g.dates.includes(kstYmd(now))) return false;
  const hmNow = kstHm(now);
  return g.times.length === 0 || g.times.some((t) => t > hmNow);
}

/** 🔔 알림 조용한 시간 (KST 22:00~08:00). 그 사이 올라온 글은 08:00 에 모아서, 오늘 급구만 06:00 부터 */
export function quietNow(now: Date): boolean {
  const h = Number(kstHm(now).slice(0, 2));
  return h >= 22 || h < 8;
}
export const urgentWindowNow = (now: Date): boolean => {
  const h = Number(kstHm(now).slice(0, 2));
  return h >= 6 && h < 22;
};

export const GIG_GUIDE = "카톡 글을 붙여넣으면 칸이 채워져요 · 날짜 지난 대강은 자동으로 내려가요";
