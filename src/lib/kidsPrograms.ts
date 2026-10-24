/**
 * 📍 동네 체험 (10/24, 육아방). 아이볼(ibol.kr, 같은 운영자의 자매 서비스) 파트너 API 의 체험·축제·공연 프로그램.
 * 서버·클라이언트 공용 순수 함수: 응답 정규화(필드 이름이 조금 달라도 받아들임), 접수 상태(KST), 지역 목록, 링크.
 * 개인정보 없음. 기관 신청 링크는 손대지 않고, 아이볼 링크에만 ?from=nobangjang.
 */
import regions from "@/data/kr-regions.json";

export const KIDS_ROOM = "육아-덕후방";
export const KIDS_TAB = "near";
export const KIDS_TAB_LABEL = "📍동네 체험";
export const KIDS_SEED_PREFIX = "ibol:";
export const KIDS_ERROR_TEXT = "잠시 후 다시 볼 수 있어요";
export const KIDS_IOS_HINT = "아이폰은 홈 화면에 추가하면 알림이 와요";

export type KidsProgram = {
  id: string;
  name: string;
  institution: string;
  place: string;
  /** 시·구 (카드의 "기관 · 도시") */
  city: string;
  age: string;
  free: boolean;
  cost: string;
  /** 체험·축제·공연 */
  kind: string;
  /** 프로그램 날짜 (사람이 읽는 글) */
  dateText: string;
  startDate: string | null;
  endDate: string | null;
  /** 접수 시작·마감 (ISO, UTC) */
  applyStartAt: string | null;
  applyEndAt: string | null;
  /** 기관 신청 페이지 (그대로) */
  applyUrl: string | null;
  /** 아이볼 페이지 (?from=nobangjang) */
  ibolUrl: string | null;
  source: string;
};

// ---------------------------------------------------------------------------
// 지역 (시·도 → 시·군·구). 광역시·특별시는 "서울 마포구" 또는 "광주"(시 전체), 도는 "수원시", 세종은 "세종"
// ---------------------------------------------------------------------------
export type Region = { name: string; short: string; metro: boolean; districts: string[] };
export const REGIONS = regions as Region[];

/** 시·도 하나에서 고를 수 있는 값 (보이는 이름, 보낼 값) */
export function areaOptions(r: Region): { label: string; value: string }[] {
  if (!r.metro) return r.districts.map((d) => ({ label: d, value: d }));
  return [{ label: `${r.short} 전체`, value: r.short }, ...r.districts.map((d) => ({ label: d, value: `${r.short} ${d}` }))];
}

const AREAS: ReadonlySet<string> = new Set(REGIONS.flatMap((r) => areaOptions(r).map((o) => o.value)));
export const isValidArea = (v: string | null | undefined): v is string => !!v && AREAS.has(v);
/** 화면에 보일 짧은 이름: "서울 마포구" → "마포구", "성남시" → "성남시" */
export const areaShort = (area: string) => area.split(" ").pop() ?? area;

// ---------------------------------------------------------------------------
// 응답 정규화
// ---------------------------------------------------------------------------
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** 여러 이름 후보 중 처음 값이 있는 것. "a.b" 는 중첩 */
function pick(o: Obj, keys: string[]): unknown {
  for (const k of keys) {
    let v: unknown = o;
    for (const part of k.split(".")) v = isObj(v) ? v[part] : undefined;
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

const str = (v: unknown): string => {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (Array.isArray(v)) return v.map(str).filter(Boolean).join(", ");
  if (isObj(v)) return str(pick(v, ["name", "title", "label", "text"]));
  return "";
};

const bool = (v: unknown): boolean | undefined => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["1", "true", "y", "yes", "무료", "free"].includes(s)) return true;
    if (["0", "false", "n", "no", "유료", "paid"].includes(s)) return false;
  }
  return undefined;
};

/**
 * 날짜·시각 → ISO(UTC). 시간대가 없으면 KST 로 본다. "2026-10-25 10:00", "2026.10.25 10:00", "20261025", 초·밀리초 숫자.
 */
export function parseKstDate(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = v < 1e12 ? v * 1000 : v;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (/^\d{10,13}$/.test(s)) return parseKstDate(Number(s));
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s) && /\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const m = /^(\d{4})[-./년\s]*(\d{1,2})[-./월\s]*(\d{1,2})일?(?:[T\s(]+(?:[월화수목금토일]\)\s*)?(\d{1,2})(?::|시\s*)(\d{2})?(?::(\d{2}))?)?/.exec(s);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", se = "0"] = m;
  const t = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h) - 9, Number(mi || 0), Number(se || 0));
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

const httpUrl = (v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  try {
    const u = new URL(s, "https://ibol.kr");
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
};

/** 아이볼 링크에만: from=nobangjang (이미 있으면 그대로) */
export function ibolLink(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!/(^|\.)ibol\.kr$/i.test(u.hostname)) return url;
    if (!u.searchParams.has("from")) u.searchParams.set("from", "nobangjang");
    return u.toString();
  } catch {
    return null;
  }
}

const F = {
  id: ["id", "programId", "program_id", "programID", "uid", "key", "slug"],
  name: ["name", "title", "programName", "program_name", "programTitle", "subject"],
  institution: ["institution", "org", "organization", "orgName", "org_name", "institutionName", "institution_name", "host", "organizer", "agency", "center"],
  place: ["place", "location", "venue", "placeName", "place_name", "address", "addr"],
  city: ["area", "city", "region", "sigungu", "district", "gu", "location.city"],
  age: ["age", "targetAge", "target_age", "ageText", "age_text", "ages", "target", "ageRange", "age_range", "audience"],
  free: ["free", "isFree", "is_free", "freeYn", "free_yn"],
  cost: ["cost", "price", "fee", "costText", "cost_text", "priceText", "charge"],
  kind: ["kind", "type", "category", "programType", "program_type", "genre"],
  dateText: ["dates", "programDates", "program_dates", "date", "period", "dateText", "date_text", "schedule", "eventDate", "event_date"],
  start: ["startDate", "start_date", "programStart", "program_start", "eventStart", "event_start", "dates.start", "programDates.start", "program_dates.start", "period.start", "from", "start"],
  end: ["endDate", "end_date", "programEnd", "program_end", "eventEnd", "event_end", "dates.end", "programDates.end", "program_dates.end", "period.end", "to", "end"],
  applyStart: ["applyStart", "apply_start", "applyStartAt", "apply_start_at", "registrationStart", "registration_start", "registrationStartAt", "registration_start_at", "regStart", "reg_start", "receiptStart", "receipt_start", "applyFrom", "registration.start", "apply.start", "registration.startAt", "apply.startAt"],
  applyEnd: ["applyEnd", "apply_end", "applyEndAt", "apply_end_at", "registrationEnd", "registration_end", "registrationEndAt", "registration_end_at", "regEnd", "reg_end", "receiptEnd", "receipt_end", "applyTo", "registration.end", "apply.end", "registration.endAt", "apply.endAt"],
  applyUrl: ["applyUrl", "apply_url", "applyLink", "apply_link", "registrationUrl", "registration_url", "link", "url", "institutionUrl", "institution_url", "orgUrl", "sourceUrl", "source_url"],
  ibolUrl: ["ibolUrl", "ibol_url", "ibolLink", "ibol_link", "detailUrl", "detail_url", "ibol", "pageUrl", "page_url"],
  source: ["source", "sourceName", "source_name", "provider", "dataSource", "data_source"],
} as const;

/** 알려진 필드 이름 (모르는 모양을 기록할 때) */
const KNOWN = new Set(Object.values(F).flat().map((k) => k.split(".")[0]!));

function formatCost(v: unknown): string {
  if (typeof v === "number") return v === 0 ? "무료" : `${v.toLocaleString("ko-KR")}원`;
  const s = str(v);
  return /^\d+$/.test(s) ? formatCost(Number(s)) : s;
}

function dateRangeText(start: string | null, end: string | null): string {
  const f = (iso: string) => {
    const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  };
  if (start && end && f(start) !== f(end)) return `${f(start)} ~ ${f(end)}`;
  return start ? f(start) : end ? `~ ${f(end)}` : "";
}

/** 한 항목 → KidsProgram. id·이름이 없으면 null */
export function normalizeProgram(raw: unknown): KidsProgram | null {
  if (!isObj(raw)) return null;
  const id = str(pick(raw, [...F.id])).slice(0, 60);
  const name = str(pick(raw, [...F.name])).slice(0, 200);
  if (!id || !name || !/^[\w.:-]{1,60}$/.test(id)) return null;
  const costRaw = pick(raw, [...F.cost]);
  const cost = formatCost(costRaw);
  const free = bool(pick(raw, [...F.free])) ?? (costRaw === 0 || /^(무료|0원?|free)$/i.test(cost));
  const dt = pick(raw, [...F.dateText]);
  const startDate = parseKstDate(pick(raw, [...F.start]) ?? (Array.isArray(dt) ? dt[0] : typeof dt === "string" ? dt : undefined));
  const endDate = parseKstDate(pick(raw, [...F.end]) ?? (Array.isArray(dt) ? dt[dt.length - 1] : undefined));
  const dateText = (typeof dt === "string" ? dt.trim() : "") || dateRangeText(startDate, endDate);
  // 신청 링크 칸에 아이볼 주소만 있으면 아이볼 링크로 옮긴다 (신청하기는 아이볼로 대신 감)
  let applyUrl = httpUrl(pick(raw, [...F.applyUrl]) ?? (typeof raw.apply === "string" ? raw.apply : undefined));
  let ibol = httpUrl(pick(raw, [...F.ibolUrl]));
  if (applyUrl && /^https?:\/\/([\w-]+\.)*ibol\.kr\//i.test(applyUrl)) {
    ibol ??= applyUrl;
    applyUrl = null;
  }
  return {
    id,
    name,
    institution: str(pick(raw, [...F.institution])).slice(0, 100),
    place: str(pick(raw, [...F.place])).slice(0, 200),
    city: str(pick(raw, [...F.city])).slice(0, 40),
    age: str(pick(raw, [...F.age])).slice(0, 60),
    free,
    cost: free ? "무료" : cost.slice(0, 60),
    kind: str(pick(raw, [...F.kind])).slice(0, 20),
    dateText: dateText.slice(0, 100),
    startDate,
    endDate,
    applyStartAt: parseKstDate(pick(raw, [...F.applyStart])),
    applyEndAt: parseKstDate(pick(raw, [...F.applyEnd])),
    applyUrl,
    ibolUrl: ibolLink(ibol),
    source: str(pick(raw, [...F.source])).slice(0, 100),
  };
}

/** 응답 전체 → 항목 배열. 배열·{items}·{data:{items}} 등 */
export function extractItems(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  if (!isObj(body)) return null;
  for (const k of ["items", "programs", "data", "results", "list", "rows", "result"]) {
    const v = body[k];
    if (Array.isArray(v)) return v;
    if (isObj(v)) {
      const inner = extractItems(v);
      if (inner) return inner;
    }
  }
  return null;
}

export type NormalizeResult = { items: KidsProgram[]; dropped: number; unknownKeys: string[]; shapeOk: boolean };

/** 응답 정규화 + 모르는 모양 정보 (서버가 한 번씩 기록) */
export function normalizeResponse(body: unknown): NormalizeResult {
  const raw = extractItems(body);
  if (!raw) return { items: [], dropped: 0, unknownKeys: isObj(body) ? Object.keys(body).slice(0, 20) : [typeof body], shapeOk: false };
  const items: KidsProgram[] = [];
  const unknown = new Set<string>();
  let dropped = 0;
  for (const r of raw) {
    const p = normalizeProgram(r);
    if (p) items.push(p);
    else dropped++;
    if (isObj(r)) for (const k of Object.keys(r)) if (!KNOWN.has(k)) unknown.add(k);
  }
  return { items, dropped, unknownKeys: [...unknown].slice(0, 30), shapeOk: true };
}

// ---------------------------------------------------------------------------
// 접수 상태 (KST)
// ---------------------------------------------------------------------------
export type KidsStatus = { key: "open" | "soon" | "closed"; label: string } | null;

/** "MM/DD HH:mm" (KST) */
export function kstShort(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export function programStatus(p: Pick<KidsProgram, "applyStartAt" | "applyEndAt">, now = new Date()): KidsStatus {
  const t = now.getTime();
  if (p.applyEndAt && t > new Date(p.applyEndAt).getTime()) return { key: "closed", label: "마감" };
  if (p.applyStartAt && t < new Date(p.applyStartAt).getTime()) return { key: "soon", label: `접수 예정 ${kstShort(p.applyStartAt)}` };
  if (p.applyStartAt || p.applyEndAt) return { key: "open", label: "접수 중" };
  return null;
}

/** 이번 주(지금부터 7일) 무료 체험: 마감 아니고, 프로그램 날짜나 접수가 7일 안에 걸린 것 */
export function isThisWeekFree(p: KidsProgram, now = new Date()): boolean {
  if (!p.free) return false;
  const s = programStatus(p, now);
  if (s?.key === "closed") return false;
  const t = now.getTime();
  const week = t + 7 * 86400_000;
  const start = p.startDate ? new Date(p.startDate).getTime() : null;
  const end = p.endDate ? new Date(p.endDate).getTime() + 86400_000 : start !== null ? start + 86400_000 : null;
  if (start !== null && end !== null) return start <= week && end >= t;
  if (s?.key === "open") return true;
  return !!p.applyStartAt && new Date(p.applyStartAt).getTime() <= week;
}

// ---------------------------------------------------------------------------
// 링크·글
// ---------------------------------------------------------------------------
export const programPath = (id: string) => `/kids/${encodeURIComponent(id)}`;
export const isProgramId = (id: string) => /^[\w.:-]{1,60}$/.test(id);

/** 신청하기 → 기관 신청 페이지 (없으면 아이볼) */
export const applyHref = (p: Pick<KidsProgram, "applyUrl" | "ibolUrl">) => p.applyUrl ?? p.ibolUrl;

export const programPostTitle = (p: Pick<KidsProgram, "name" | "institution">) =>
  `[동네 체험] ${p.name}${p.institution ? ` · ${p.institution}` : ""}`.slice(0, 120);

export function programPostBody(p: KidsProgram): string {
  const lines = [
    p.dateText && `일시: ${p.dateText}`,
    p.place && `장소: ${p.place}`,
    p.age && `대상: ${p.age}`,
    `비용: ${p.free ? "무료" : p.cost || "기관 안내 참고"}`,
    p.applyStartAt && `신청 시작: ${kstShort(p.applyStartAt)}`,
    `출처: ${p.source || p.institution || "아이볼"} (아이볼 정리)`,
  ];
  return lines.filter(Boolean).join("\n");
}
