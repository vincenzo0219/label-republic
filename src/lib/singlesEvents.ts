/**
 * 💌 미혼남녀 만남 행사 (10/26 운영자 승인, 2주 시험 운영). 정보만 모아 보여 주는 방.
 * - 지자체·사찰·공공(·민간 유료) 행사를 운영자가 원문 공지를 보고 한 건씩 넣는다 (POST /api/admin/singles-events)
 * - 사람과 사람을 이어 주는 기능은 없다: 갈 거예요·같이 가요·조 짜기·정모·프로필 모두 없음, 연락처·SNS 교환 금지 (결혼중개업법, 098 부터 글·댓글·채팅은 됨)
 * - "나 신청 가능?": 출생연도·성별·거주·직장 지역·초혼 여부 → 가능 / 조건부 / 불가 + 이유. 입력값은 브라우저에만
 * - "떨어졌어요": 가까운 지역의 다음 행사
 * 서버·브라우저 공용 순수 함수.
 */
import { REGIONS, SIDOS, addDays, isValidArea, kstYmd, mdLabel } from "./instructorRoom";

export const SINGLES_ROOM = "미혼남녀-만남-행사";
export const SINGLES_ROOM_NAME = "💌 미혼남녀 만남 행사";
export const SINGLES_ROOM_DESC = "지자체·사찰·공공 만남 행사 모음. 만 19세 이상";
export const SINGLES_PATH = `/c/${encodeURIComponent(SINGLES_ROOM)}`;
/** 방 안 💌 만남 행사 탭 (098, 기본 탭이라 주소는 SINGLES_PATH 그대로. src/lib/heads.ts) */
export const SINGLES_TAB = "meet";
export const singlesEventPath = (id: string) => `/singles/${id}`;
/** 카드·상세·MCP 결과마다 붙는 고지 */
export const SINGLES_NOTICE = "최종 기준은 원문 공지예요. 신청은 원문에서 직접 해 주세요.";
export const SINGLES_SCOPE_NOTE = "노방장은 행사 정보만 모아 보여 줘요. 사람 소개·매칭·대리 신청은 하지 않아요.";
/** 만 19세 이상 (청소년보호법: 만 19세가 되는 해의 1월 1일부터는 청소년이 아니다) */
export const ADULT_AGE = 19;

export const ORGANIZER_TYPES = { gov: "지자체", temple: "사찰", public: "공공", private_paid: "민간 유료" } as const;
export type OrganizerType = keyof typeof ORGANIZER_TYPES;
export const ORGANIZER_TYPE_KEYS = Object.keys(ORGANIZER_TYPES) as OrganizerType[];

/** 지역 요건을 무엇으로 보나: 없음 · 거주 · 직장 · 거주 또는 직장 */
export const REGION_BASES = { any: "지역 제한 없음", live: "거주", work: "직장", live_or_work: "거주 또는 직장" } as const;
export type RegionBasis = keyof typeof REGION_BASES;
export const REGION_BASIS_KEYS = Object.keys(REGION_BASES) as RegionBasis[];

export type Gender = "male" | "female";
export const GENDERS: Record<Gender, string> = { male: "남성", female: "여성" };

export type SinglesEvent = {
  id: string;
  title: string;
  organizer: string;
  organizerType: OrganizerType;
  /** 행사가 열리는 곳 (시·도 짧은 이름 + 시·군·구) */
  sido: string;
  sigungu: string;
  venue: string;
  /** 'YYYY-MM-DD' (KST). 모르면 null */
  applyStart: string | null;
  applyEnd: string | null;
  eventDate: string | null;
  eventEnd: string | null;
  birthYearMin: number | null;
  birthYearMax: number | null;
  /** 모집 인원. 0 이면 그 성별은 모집하지 않는다, null 이면 공지에 없음 */
  quotaMale: number | null;
  quotaFemale: number | null;
  regionBasis: RegionBasis;
  /** 모든 성별에 같은 지역 ("경남", "경남 창원시") */
  areas: string[];
  /** 성별마다 다르면 (예: 남성은 군 거주·직장, 여성은 대구·경북). 비어 있으면 areas */
  areasMale: string[];
  areasFemale: string[];
  firstMarriageOnly: boolean;
  /** 참가비 (원). null 이면 공지에 없음 */
  fee: number | null;
  /** 선착순 · 추첨 · 서류 등 */
  selection: string;
  /** 지난 회차 경쟁률 (공개된 것만, 원문 그대로 짧게) */
  competitionNote: string;
  notes: string;
  originalUrl: string;
  /** 운영자가 원문을 확인한 날 'YYYY-MM-DD' */
  collectedAt: string;
};

export type SinglesProfile = {
  birthYear?: number | null;
  gender?: Gender | null;
  /** "경남" 또는 "경남 창원시" */
  live?: string | null;
  work?: string | null;
  /** true 초혼, false 재혼, null 모름 */
  firstMarriage?: boolean | null;
};

// ---------------------------------------------------------------------------
// 상태 · D-day
// ---------------------------------------------------------------------------
export type SinglesStatus = "upcoming" | "open" | "closed" | "ended";
export const STATUS_LABELS: Record<SinglesStatus, string> = { upcoming: "모집 예정", open: "모집 중", closed: "모집 마감", ended: "행사 끝남" };

export const todayKst = (now = new Date()) => kstYmd(now);
const dayNum = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`) / 86_400_000;
export const daysBetween = (from: string, to: string) => Math.round(dayNum(to) - dayNum(from));

export function eventStatus(ev: Pick<SinglesEvent, "applyStart" | "applyEnd" | "eventDate" | "eventEnd">, today: string): SinglesStatus {
  const last = ev.eventEnd ?? ev.eventDate;
  if (last && last < today) return "ended";
  if (ev.applyEnd && ev.applyEnd < today) return "closed";
  if (ev.applyStart && ev.applyStart > today) return "upcoming";
  return "open";
}

/** 카드에 붙는 한 줄: "마감 D-3" · "오늘 마감" · "모집 D-5" · "모집 마감" · "행사 끝남" */
export function applyDdayLabel(ev: Pick<SinglesEvent, "applyStart" | "applyEnd" | "eventDate" | "eventEnd">, today: string): string {
  const st = eventStatus(ev, today);
  if (st === "upcoming") return `모집 D-${daysBetween(today, ev.applyStart!)}`;
  if (st === "open") {
    if (!ev.applyEnd) return "모집 중";
    const d = daysBetween(today, ev.applyEnd);
    return d === 0 ? "오늘 마감" : `마감 D-${d}`;
  }
  return STATUS_LABELS[st];
}

/** "10/20(월) ~ 10/31(금)" · "~ 10/31(금)" · "공지 확인" */
export function periodLabel(start: string | null, end: string | null): string {
  if (start && end) return start === end ? mdLabel(start) : `${mdLabel(start)} ~ ${mdLabel(end)}`;
  if (end) return `~ ${mdLabel(end)}`;
  if (start) return `${mdLabel(start)} ~`;
  return "원문 공지 확인";
}

export const quotaLabel = (ev: Pick<SinglesEvent, "quotaMale" | "quotaFemale">): string => {
  const parts = [ev.quotaMale !== null ? `남 ${ev.quotaMale}명` : "", ev.quotaFemale !== null ? `여 ${ev.quotaFemale}명` : ""].filter(Boolean);
  return parts.join(" · ");
};

export const birthLabel = (ev: Pick<SinglesEvent, "birthYearMin" | "birthYearMax">): string =>
  ev.birthYearMin && ev.birthYearMax ? `${ev.birthYearMin}~${ev.birthYearMax}년생` : ev.birthYearMin ? `${ev.birthYearMin}년생부터` : ev.birthYearMax ? `${ev.birthYearMax}년생까지` : "";

/** 지역 요건 한 줄 */
export function regionRuleLabel(ev: Pick<SinglesEvent, "regionBasis" | "areas" | "areasMale" | "areasFemale">): string {
  if (ev.regionBasis === "any") return REGION_BASES.any;
  const basis = REGION_BASES[ev.regionBasis];
  if (ev.areasMale.length || ev.areasFemale.length) {
    const m = (ev.areasMale.length ? ev.areasMale : ev.areas).join("·");
    const f = (ev.areasFemale.length ? ev.areasFemale : ev.areas).join("·");
    return `${basis}: 남성 ${m || "제한 없음"} / 여성 ${f || "제한 없음"}`;
  }
  return ev.areas.length ? `${basis}: ${ev.areas.join("·")}` : REGION_BASES.any;
}

// ---------------------------------------------------------------------------
// 나 신청 가능?
// ---------------------------------------------------------------------------
export type Verdict = "ok" | "maybe" | "no";
export const VERDICT_LABELS: Record<Verdict, string> = { ok: "가능", maybe: "조건부", no: "불가" };
export type Eligibility = { verdict: Verdict; reasons: string[] };

const worse = (a: Verdict, b: Verdict): Verdict => (a === "no" || b === "no" ? "no" : a === "maybe" || b === "maybe" ? "maybe" : "ok");

/** place("경남 창원시" 또는 "경남")가 area("경남" 또는 "경남 창원시") 안인가: yes · no · partial(시·도만 알아서 모름) */
export function placeIn(place: string, area: string): "yes" | "no" | "partial" {
  const [ps, pg = ""] = place.split(" ");
  const [as, ag = ""] = area.split(" ");
  if (ps !== as) return "no";
  if (!ag) return "yes";
  if (!pg) return "partial";
  return pg === ag ? "yes" : "no";
}
const placeInAny = (place: string, areas: readonly string[]): "yes" | "no" | "partial" => {
  const r = areas.map((a) => placeIn(place, a));
  return r.includes("yes") ? "yes" : r.includes("partial") ? "partial" : "no";
};

/** 이 성별에게 적용되는 지역 목록. 성별을 모르는데 성별마다 다르면 null */
function areasFor(ev: SinglesEvent, gender: Gender | null | undefined): string[] | null {
  const split = ev.areasMale.length > 0 || ev.areasFemale.length > 0;
  if (!split) return ev.areas;
  if (!gender) return null;
  const own = gender === "male" ? ev.areasMale : ev.areasFemale;
  return own.length ? own : ev.areas;
}

export function checkEligibility(ev: SinglesEvent, p: SinglesProfile, today: string): Eligibility {
  let verdict = "ok" as Verdict;
  const reasons: string[] = [];
  const add = (v: Verdict, why: string) => {
    verdict = worse(verdict, v);
    reasons.push(why);
  };
  const year = Number(today.slice(0, 4));

  const st = eventStatus(ev, today);
  if (st === "closed" || st === "ended") add("no", st === "closed" ? "모집이 끝났어요" : "이미 끝난 행사예요");

  // 나이
  if (p.birthYear) {
    if (year - p.birthYear < ADULT_AGE) add("no", "만 19세 이상만 볼 수 있는 행사예요");
    else if ((ev.birthYearMin && p.birthYear < ev.birthYearMin) || (ev.birthYearMax && p.birthYear > ev.birthYearMax)) add("no", `${birthLabel(ev)}만 신청할 수 있어요`);
  } else if (ev.birthYearMin || ev.birthYearMax) add("maybe", `출생연도 확인 필요 (${birthLabel(ev)})`);

  // 성별 모집 인원
  if (p.gender) {
    const q = p.gender === "male" ? ev.quotaMale : ev.quotaFemale;
    if (q === 0) add("no", `${GENDERS[p.gender === "male" ? "female" : "male"]}만 모집해요`);
  }

  // 지역
  if (ev.regionBasis !== "any") {
    const areas = areasFor(ev, p.gender);
    if (areas === null) add("maybe", "성별에 따라 지역 요건이 달라요. 성별을 골라 주세요");
    else if (areas.length) {
      const want = areas.join("·");
      const live = p.live ? placeInAny(p.live, areas) : null;
      const work = p.work ? placeInAny(p.work, areas) : null;
      const proof = "직장 소재지 증빙(재직증명 등)이 필요해요";
      if (ev.regionBasis === "live") {
        if (live === "no") add("no", `${want} 거주자만 신청할 수 있어요`);
        else if (live !== "yes") add("maybe", `${want} 거주 여부 확인 필요`);
      } else if (ev.regionBasis === "work") {
        if (work === "no") add("no", `${want} 직장인만 신청할 수 있어요`);
        else if (work === "yes") add("maybe", proof);
        else add("maybe", `${want} 직장 여부 확인 필요`);
      } else {
        if (live === "yes") {
          // 거주로 충분
        } else if (work === "yes") add("maybe", proof);
        else if (live === "no" && work === "no") add("no", `${want}에 살거나 직장이 있어야 해요`);
        else if (live === "no" && work === null) add("maybe", `${want}에 직장이 있으면 신청할 수 있어요`);
        else add("maybe", `${want} 거주·직장 여부 확인 필요`);
      }
    }
  }

  // 초혼
  if (ev.firstMarriageOnly) {
    if (p.firstMarriage === false) add("no", "초혼만 신청할 수 있어요");
    else if (p.firstMarriage !== true) add("maybe", "초혼만 신청할 수 있어요");
  }

  if (st === "upcoming" && ev.applyStart && verdict !== "no") reasons.push(`모집은 ${mdLabel(ev.applyStart)}부터`);
  if (!reasons.length) reasons.push("입력한 조건이 모두 맞아요");
  return { verdict, reasons };
}

/** 저장된 입력값이 쓸 만한지 (브라우저 localStorage 에서 읽은 값) */
export function cleanProfile(raw: unknown, today: string): SinglesProfile {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const year = Number(today.slice(0, 4));
  const by = typeof o.birthYear === "number" && Number.isInteger(o.birthYear) && o.birthYear >= 1940 && o.birthYear <= year ? o.birthYear : null;
  const gender = o.gender === "male" || o.gender === "female" ? o.gender : null;
  const area = (v: unknown) => (typeof v === "string" && isValidArea(v) ? v : null);
  const fm = typeof o.firstMarriage === "boolean" ? o.firstMarriage : null;
  return { birthYear: by, gender, live: area(o.live), work: area(o.work), firstMarriage: fm };
}

// ---------------------------------------------------------------------------
// 떨어졌어요 → 가까운 지역 다음 행사
// ---------------------------------------------------------------------------
/** 시·도 대략 중심 (거리 순서만 쓴다) */
const SIDO_CENTER: Record<string, [number, number]> = {
  서울: [37.57, 126.98], 부산: [35.18, 129.08], 대구: [35.87, 128.6], 인천: [37.46, 126.71], 광주: [35.16, 126.85],
  대전: [36.35, 127.38], 울산: [35.54, 129.31], 세종: [36.48, 127.29], 경기: [37.41, 127.52], 강원: [37.83, 128.16],
  충북: [36.64, 127.49], 충남: [36.52, 126.8], 전북: [35.72, 127.15], 전남: [34.87, 126.99], 경북: [36.58, 128.73],
  경남: [35.24, 128.69], 제주: [33.49, 126.5],
};
export function sidoKm(a: string, b: string): number {
  if (a === b) return 0;
  const p = SIDO_CENTER[a];
  const q = SIDO_CENTER[b];
  if (!p || !q) return 9999;
  const r = Math.PI / 180;
  const x = (q[1] - p[1]) * r * Math.cos(((p[0] + q[0]) / 2) * r);
  const y = (q[0] - p[0]) * r;
  return Math.round(Math.sqrt(x * x + y * y) * 6371);
}

/** 기준 지역에서 행사까지: [같은 시군구 0 · 같은 시도 1 · 다른 시도 2, km] */
export function regionDistance(from: { sido: string; sigungu: string }, ev: Pick<SinglesEvent, "sido" | "sigungu">): [number, number] {
  if (from.sido === ev.sido) return [from.sigungu && from.sigungu === ev.sigungu ? 0 : 1, 0];
  return [2, sidoKm(from.sido, ev.sido)];
}

/**
 * 떨어진 행사 다음으로 볼 행사: 모집 중·예정이고 (입력값이 있으면) 불가가 아닌 것, 가까운 지역 먼저, 같은 거리면 마감·시작이 빠른 것.
 * 기준 지역은 내 거주지(있으면), 없으면 떨어진 행사의 지역.
 */
export function nextAfterRejection(events: readonly SinglesEvent[], rejected: SinglesEvent, profile: SinglesProfile, today: string, n = 3): SinglesEvent[] {
  const [ls, lg = ""] = (profile.live ?? "").split(" ");
  const from = ls && SIDOS.includes(ls) ? { sido: ls, sigungu: lg } : { sido: rejected.sido, sigungu: rejected.sigungu };
  const soon = (e: SinglesEvent) => (eventStatus(e, today) === "open" ? (e.applyEnd ?? "9999") : (e.applyStart ?? "9999"));
  return events
    .filter((e) => e.id !== rejected.id)
    .filter((e) => ["open", "upcoming"].includes(eventStatus(e, today)))
    .filter((e) => checkEligibility(e, profile, today).verdict !== "no")
    .map((e) => ({ e, d: regionDistance(from, e), s: soon(e) }))
    .sort((a, b) => a.d[0] - b.d[0] || a.d[1] - b.d[1] || a.s.localeCompare(b.s) || a.e.id.localeCompare(b.e.id))
    .slice(0, n)
    .map((x) => x.e);
}

/** 목록 순서: 모집 중(마감 빠른 순) → 모집 예정(시작 빠른 순) → 마감 → 끝남 */
export function sortForList(events: readonly SinglesEvent[], today: string): SinglesEvent[] {
  const rank: Record<SinglesStatus, number> = { open: 0, upcoming: 1, closed: 2, ended: 3 };
  const key = (e: SinglesEvent) => {
    const st = eventStatus(e, today);
    return st === "open" ? (e.applyEnd ?? "9999") : st === "upcoming" ? (e.applyStart ?? "9999") : (e.eventDate ?? e.applyEnd ?? "0000");
  };
  return [...events].sort((a, b) => {
    const ra = rank[eventStatus(a, today)];
    const rb = rank[eventStatus(b, today)];
    if (ra !== rb) return ra - rb;
    return ra >= 2 ? key(b).localeCompare(key(a)) : key(a).localeCompare(key(b));
  });
}

// ---------------------------------------------------------------------------
// 알림: 동의하고 보낸 조건(출생연도·성별·지역)만으로 맞춰 본다
// ---------------------------------------------------------------------------
export const ALERT_CONSENT_TEXT =
  "알림을 보내려고 내가 고른 조건(출생연도, 성별, 지역)만 이 브라우저의 알림 구독과 함께 저장해요. 다른 목적으로 쓰지 않고, 알림을 끄면 바로 지워요.";
export const ALERT_CONSENT_VERSION = "2026-10-26";
export const MAX_ALERT_AREAS = 3;

export type AlertCriteria = { birthYear: number | null; gender: Gender | null; areas: string[] };

/** 알림 대상인가: 보낸 조건으로 불가가 아니고, 지역을 골랐으면 행사 지역이나 지역 요건이 그 지역에 걸친다 */
export function alertMatches(ev: SinglesEvent, c: AlertCriteria, today: string): boolean {
  const live = c.areas.length === 1 ? c.areas[0]! : null;
  if (checkEligibility({ ...ev, applyEnd: null, eventDate: null, eventEnd: null, applyStart: null }, { birthYear: c.birthYear, gender: c.gender, live }, today).verdict === "no") return false;
  if (!c.areas.length) return true;
  // 행사가 내 시·도에서 열리거나, 지역 요건이 내 지역에 걸치면
  const rule = areasFor(ev, c.gender) ?? [...ev.areas, ...ev.areasMale, ...ev.areasFemale];
  const overlap = (a: string, b: string) => placeIn(a, b) !== "no" || placeIn(b, a) !== "no";
  return c.areas.some((a) => a.split(" ")[0] === ev.sido || (ev.regionBasis !== "any" && rule.some((r) => overlap(a, r))));
}

/** 오늘 모집이 열린 행사인가 (어제 열린 것까지: 하루 늦게 넣어도 한 번은 알린다) */
export const opensNow = (ev: Pick<SinglesEvent, "applyStart">, today: string) => !!ev.applyStart && ev.applyStart <= today && ev.applyStart >= addDays(today, -1);
/** 내일이 마감인가 */
export const closesTomorrow = (ev: Pick<SinglesEvent, "applyEnd">, today: string) => !!ev.applyEnd && ev.applyEnd === addDays(today, 1);

export const regionChoices = (): { sido: string; districts: string[] }[] => REGIONS.map((r) => ({ sido: r.short, districts: r.districts }));

/** MCP·검색어 지역 → "경남" · "경남 창원시". "창원", "창원시", "경상남도", "경남 창원" 도 받는다. 모르면 null */
export function normalizeRegion(input: string): string | null {
  const t = input.trim().replace(/\s+/g, " ");
  if (!t) return null;
  if (isValidArea(t)) return t;
  const strip = (s: string) => s.replace(/(특별자치시|특별자치도|특별시|광역시|도|시|군|구)$/, "");
  const parts = t.split(" ");
  const sido = REGIONS.find((r) => r.short === parts[0] || r.name === parts[0] || strip(r.name) === parts[0]);
  if (sido && parts.length === 1) return sido.short;
  const want = strip(parts.length > 1 ? parts.slice(1).join("") : t);
  if (!want) return sido?.short ?? null;
  const pool = sido ? [sido] : REGIONS;
  for (const r of pool) {
    const d = r.districts.find((x) => x === want || strip(x) === want);
    if (d) return `${r.short} ${d}`;
  }
  return sido?.short ?? null;
}
