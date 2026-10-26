/**
 * 🧘 요가·필라테스 강사방 (10/25 운영자 승인). 핵심은 게시판 두 개: 카톡 대강방보다 찾기 쉽게.
 * - 📋 대강(kind=sub): 강사끼리 하루 대타. 날짜·시간·지역·수업·회당 페이. 날짜가 지나면 내려감
 * - 💼 구인구직(kind=job, 10/26): 센터 정규·아파트·기업 출강·개인레슨 구인 + 강사 구직. 급여 구조·초보 가능. 30일 지나면 내려감
 * - 🙋 1대1 레슨 매칭 1단계(10/26, 결제 없음): 강사는 구인구직에 "1대1 레슨 가능"(job_type=lesson),
 *   수강생은 요가·필라테스 덕후방 🙋 탭에 "1대1 레슨 구해요"(kind=ask). 지역이 겹치고 시간대가 맞는 글을 서로 보여 준다.
 *   의료 표현(치료·재활·교정·통증·디스크…)은 받지 않는다
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
export const GIG_TAB_LABEL = "📋 대강";
/** 💼 구인구직 탭 (?tab=jobs, 10/26) */
export const JOB_TAB = "jobs";
export const JOB_TAB_LABEL = "💼 구인구직";
export const isInstructorRoom = (slug: string | null | undefined): boolean => slug === INSTRUCTOR_ROOM;
export const BOARD_PATH = `/c/${encodeURIComponent(INSTRUCTOR_ROOM)}`;
export const JOBS_PATH = `${BOARD_PATH}?tab=${JOB_TAB}`;
/** 🙋 1대1 레슨 구해요: 요가·필라테스 덕후방 탭 (?tab=lesson) */
export const LESSON_ROOM = "요가-필라테스-덕후방";
export const LESSON_TAB = "lesson";
export const LESSON_TAB_LABEL = "🙋 1대1 레슨 구해요";
export const ASK_PATH = `/c/${encodeURIComponent(LESSON_ROOM)}?tab=${LESSON_TAB}`;
export const boardPathOf = (kind: GigKind) => (kind === "job" ? JOBS_PATH : kind === "ask" ? ASK_PATH : BOARD_PATH);
export const boardLabelOf = (kind: GigKind) => (kind === "job" ? JOB_TAB_LABEL : kind === "ask" ? LESSON_TAB_LABEL : GIG_TAB_LABEL);

export const GIG_KINDS = { sub: "대강", job: "구인구직", ask: "1대1 레슨 구해요" } as const;
export type GigKind = keyof typeof GIG_KINDS;

/** 💼 구인구직 구분 */
export const JOB_TYPES = { center: "센터 정규", apt: "아파트·커뮤니티", corp: "기업·관공서 출강", private: "개인레슨", seek: "구직", lesson: "1대1 레슨 가능" } as const;
export type JobType = keyof typeof JOB_TYPES;
export const JOB_TYPE_KEYS = Object.keys(JOB_TYPES) as JobType[];
export const CONTRACTS = { freelance: "프리랜서", employee: "근로계약" } as const;
export type Contract = keyof typeof CONTRACTS;
export const TIME_BANDS = ["오전", "오후", "저녁", "주말"] as const;
export const SCREENING = ["면접", "시강"] as const;
/** 1대1 레슨 장소 */
export const PLACES = { own: "본인 스튜디오", rent: "대여 스튜디오", visit: "방문" } as const;
export type Place = keyof typeof PLACES;
/** 🙋 레슨 구해요 목표 (의료 표현 없이) */
export const GOALS = { posture: "자세 관리", fitness: "체력·운동 초보", prenatal: "산전·산후", flex: "유연성", etc: "기타" } as const;
export type Goal = keyof typeof GOALS;
export const LEVELS = { none: "처음이에요", some: "조금 해 봤어요", regular: "꾸준히 했어요" } as const;
export type Level = keyof typeof LEVELS;
/** 레슨 글 지역은 여러 곳 (최대 5) */
export const MAX_AREAS = 5;

/** 레슨 글 고정 안내 (폼·목록) */
export const LESSON_NOTICE = "운동 레슨 연결이에요. 의료 행위가 아니에요. 통증이나 질환이 있으면 먼저 병원 진료를 받으세요.";
export const LESSON_SAFETY = "첫 만남은 공개된 대여 스튜디오 권장 · 선입금 요구 주의 · 문제는 신고";
/** 레슨 글에 받지 않는 의료 표현 */
const MEDICAL = /치료|재활|교정|통증|디스크|측만|진단|처방|완치|질환|도수/;
export const MEDICAL_MESSAGE = "치료·재활·교정·통증·디스크 같은 의료 표현은 쓸 수 없어요. 자세 관리·유연성처럼 운동 레슨으로 적어 주세요";
export const medicalWordIn = (...texts: string[]): boolean => MEDICAL.test(texts.join("\n").replace(/\s/g, ""));
/** 레슨 매칭 글인지 (강사 1대1 레슨 가능 · 수강생 구해요) */
export const isLessonPost = (g: { kind: GigKind; jobType?: JobType | null }) => g.kind === "ask" || (g.kind === "job" && g.jobType === "lesson");

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

/** 구인구직 글은 올린 뒤 이만큼 보인다 (다시 올리면 새로) */
export const JOB_DAYS = 30;
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
  kind: z.enum(["sub", "job", "ask"]),
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
  // 💼 구인구직 칸 (대강 글에서는 무시)
  jobType: z.enum(JOB_TYPE_KEYS as [JobType, ...JobType[]]).nullable().default(null),
  /** 기본급 (월, 원) */
  payBase: z.number().int().min(0).max(20_000_000).nullable().default(null),
  payTiers: text(120),
  noshowPay: text(120),
  contract: z.enum(["freelance", "employee"]).nullable().default(null),
  career: text(60),
  beginnerOk: z.boolean().default(false),
  timeBands: z.array(z.enum(TIME_BANDS)).max(4).default([]),
  period: text(60),
  screening: z.array(z.enum(SCREENING)).max(2).default([]),
  // 🙋 1대1 레슨 칸
  areas: z.array(z.string().max(32)).max(MAX_AREAS).default([]),
  /** 회당 금액 범위의 위쪽 (아래쪽은 pay) */
  payMax: z.number().int().min(0).max(1_000_000).nullable().default(null),
  places: z.array(z.enum(["own", "rent", "visit"])).max(3).default([]),
  goal: z.enum(["posture", "fitness", "prenatal", "flex", "etc"]).nullable().default(null),
  level: z.enum(["none", "some", "regular"]).nullable().default(null),
});
export type GigInput = z.infer<typeof gigInputSchema>;
/** 기본값이 있는 칸은 빼도 되는 모양 (테스트·서버 안에서 부를 때) */
export type GigInputRaw = z.input<typeof gigInputSchema>;

/** 게시판 글로 받을 수 있는지 (정치·잡담 글은 여기서 걸러진다): 날짜 또는 요일 + 수업 + 지역 */
export function gigProblem(
  g: Pick<GigInput, "kind" | "sido" | "sigungu" | "dates" | "weekdays" | "classType" | "contact"> &
    Partial<Omit<GigInput, "kind" | "sido" | "sigungu" | "dates" | "weekdays" | "classType" | "contact">>,
  today: string,
): string | null {
  if (g.kind === "job" && !g.jobType) return "구분(센터 정규·아파트·출강·개인레슨·구직)을 골라 주세요";
  if (isLessonPost(g)) {
    const areas = g.areas ?? [];
    if (!areas.length) return "지역을 하나 이상 넣어 주세요";
    if (!areas.every(isValidArea)) return "지역을 다시 골라 주세요";
    if (g.weekdays.length === 0 && (g.timeBands ?? []).length === 0) return "가능한 요일이나 시간대를 골라 주세요";
    if (g.kind === "job" && !g.pay) return "회당 금액을 넣어 주세요";
    if (g.kind === "job" && !(g.places ?? []).length) return "장소(본인 스튜디오·대여 스튜디오·방문)를 골라 주세요";
    if (g.kind === "ask" && !g.goal) return "목표를 골라 주세요";
    if (g.kind === "ask" && !g.level) return "경험 수준을 골라 주세요";
    if (g.pay && g.payMax && g.payMax < g.pay) return "금액 범위를 다시 확인해 주세요";
    if (medicalWordIn(g.studio ?? "", g.notes ?? "", g.career ?? "", g.payTiers ?? "", g.noshowPay ?? "", g.period ?? "", g.address ?? "")) return MEDICAL_MESSAGE;
    if (!/\d{3,}|@|[a-z]{3,}/i.test(g.contact)) return "연락처(전화·카톡·이메일)를 넣어 주세요";
    return null;
  }
  if (!isValidRegion(g.sido, g.sigungu)) return "지역(시·도)을 골라 주세요";
  if (g.kind === "sub" && g.dates.length === 0) return "대강 날짜를 넣어 주세요";
  if (g.kind === "job" && g.weekdays.length === 0 && (g.timeBands ?? []).length === 0) return "근무 요일이나 시간대를 골라 주세요";
  if (g.kind === "job" && !g.pay && !g.payBase) return g.jobType === "seek" ? "희망 회당 금액이나 기본급을 넣어 주세요" : "회당 금액이나 기본급을 넣어 주세요";
  if (g.dates.some((d) => d < today)) return "지난 날짜는 넣을 수 없어요";
  if (g.dates.some((d) => d > addDays(today, 180))) return "날짜는 반년 안으로 넣어 주세요";
  if (!/\d{3,}|@|[a-z]{3,}/i.test(g.contact)) return "연락처(전화·카톡·이메일)를 넣어 주세요";
  return null;
}

/** 공개 목록에서 빠지는 날 (이날까지 보임): 대강은 마지막 날짜, 구인구직은 올린 날 + 30일 */
export function expiresOn(kind: GigKind, dates: readonly string[], today: string): string {
  if (kind !== "sub") return addDays(today, JOB_DAYS);
  return [...dates].sort().pop() ?? today;
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

const manLabel = (won: number) => {
  const man = won / 10000;
  return `${Number.isInteger(man) ? man : Math.round(man * 100) / 100}만`;
};

/** "35000" → "3.5만" */
export function payLabel(pay: number | null): string {
  return pay ? manLabel(pay) : "페이 협의";
}

/** 구인구직 카드 급여: "회당 3만 · 기본급 150만", 범위면 "회당 5~7만" */
export function jobPayLabel(g: { pay: number | null; payBase: number | null; payMax?: number | null }): string {
  const per = g.pay ? (g.payMax && g.payMax > g.pay ? `회당 ${manLabel(g.pay).replace(/만$/, "")}~${manLabel(g.payMax)}` : `회당 ${manLabel(g.pay)}`) : "";
  return [per, g.payBase ? `기본급 ${manLabel(g.payBase)}` : ""].filter(Boolean).join(" · ") || "금액 협의";
}

/** 레슨 글 지역: 여러 곳이면 "마포구, 서대문구 외 1곳" */
export const areasLabel = (areas: readonly string[]): string => {
  const short = areas.map((a) => a.split(" ")[1] ?? a);
  return short.length > 2 ? `${short.slice(0, 2).join(", ")} 외 ${short.length - 2}곳` : short.join(", ");
};

/** 두 지역 값이 겹치는지: 같은 곳이거나, 한쪽이 시·도 전체("서울")이고 다른 쪽이 그 안("서울 마포구") */
export function areaOverlap(a: string, b: string): boolean {
  if (a === b) return true;
  const [sa, ga = ""] = a.split(" ");
  const [sb, gb = ""] = b.split(" ");
  return sa === sb && (!ga || !gb);
}
export const areasOverlap = (a: readonly string[], b: readonly string[]): boolean => a.some((x) => b.some((y) => areaOverlap(x, y)));
/** 시간대가 맞는지: 한쪽이 비었으면(아무 때나) 맞다고 본다 */
export const bandsOverlap = (a: readonly string[], b: readonly string[]): boolean => !a.length || !b.length || a.some((x) => b.includes(x));
/** 레슨 매칭: 지역이 겹치고 시간대가 맞으면 */
export const lessonMatches = (a: { areas: readonly string[]; timeBands: readonly string[] }, b: { areas: readonly string[]; timeBands: readonly string[] }): boolean =>
  areasOverlap(a.areas, b.areas) && bandsOverlap(a.timeBands, b.timeBands);

/** 요일 [1,3,5] → "월·수·금" */
export const weekdayLabel = (w: readonly number[]): string => [...w].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WEEKDAYS[d]).join("·");

/** 목록 카드 한 줄 날짜: 대강은 날짜들, 구인구직은 매주 요일 */
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
export const JOB_GUIDE = "회당 페이·노쇼 시 페이를 적어 두면 연락이 빨라요 · 30일 지나면 자동으로 내려가요";
