/**
 * 🔌 MCP 읽기 전용: 💌 미혼남녀 만남 행사 (10/26). 사람과 사람을 잇는 도구는 없다 (신청·소개·매칭 없음).
 * 운영자가 원문 공지에서 옮긴 항목 + 원문 링크·수집일 + "최종 기준은 원문 공지".
 */
import { config } from "./config";
import { getSinglesEvent, listSinglesEvents } from "./repo/singlesEvents";
import {
  ADULT_AGE,
  ORGANIZER_TYPES,
  SINGLES_NOTICE,
  SINGLES_SCOPE_NOTE,
  STATUS_LABELS,
  VERDICT_LABELS,
  applyDdayLabel,
  birthLabel,
  checkEligibility,
  eventStatus,
  normalizeRegion,
  periodLabel,
  quotaLabel,
  regionRuleLabel,
  singlesEventPath,
  sortForList,
  todayKst,
  type Gender,
  type SinglesEvent,
  type SinglesProfile,
} from "./singlesEvents";

const FROM = "from=playmcp";
const pageUrl = (id: string) => `${config.siteUrl}${singlesEventPath(id)}?${FROM}`;
const str = (v: unknown, max = 40) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const genderOf = (v: unknown): Gender | null => {
  const s = str(v, 10).toLowerCase();
  return ["male", "m", "남", "남성", "남자"].includes(s) ? "male" : ["female", "f", "여", "여성", "여자"].includes(s) ? "female" : null;
};
const yearOf = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 1940 && n <= 2020 ? n : null;
};
const limitOf = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(20, Math.max(1, Math.floor(n))) : 10;
};

export type SinglesItem = {
  id: string;
  title: string;
  organizer: string;
  organizer_type: string;
  region: string;
  apply_period: string;
  status: string;
  dday: string;
  event_date: string | null;
  eligibility: { verdict: string; reasons: string[] } | null;
  original_url: string;
  collected_at: string;
  url: string;
};

function item(e: SinglesEvent, today: string, profile: SinglesProfile | null): SinglesItem {
  const el = profile ? checkEligibility(e, profile, today) : null;
  return {
    id: e.id,
    title: e.title,
    organizer: e.organizer,
    organizer_type: ORGANIZER_TYPES[e.organizerType],
    region: [e.sido, e.sigungu].filter(Boolean).join(" "),
    apply_period: periodLabel(e.applyStart, e.applyEnd),
    status: STATUS_LABELS[eventStatus(e, today)],
    dday: applyDdayLabel(e, today),
    event_date: e.eventDate,
    eligibility: el ? { verdict: VERDICT_LABELS[el.verdict], reasons: el.reasons } : null,
    original_url: e.originalUrl,
    collected_at: e.collectedAt,
    url: pageUrl(e.id),
  };
}

/** find_singles_events {region?, birth_year?, gender?, work_region?, limit?}: 모집 중·예정 행사, 불가는 빼고 */
export async function findSinglesEventsTool(args: Record<string, unknown>, now = new Date()): Promise<{ events: SinglesItem[]; notice: string; note?: string }> {
  const today = todayKst(now);
  const regionIn = str(args.region);
  const workIn = str(args.work_region);
  const live = regionIn ? normalizeRegion(regionIn) : null;
  const work = workIn ? normalizeRegion(workIn) : null;
  const birthYear = yearOf(args.birth_year);
  const gender = genderOf(args.gender);
  const notice = `${SINGLES_NOTICE} ${SINGLES_SCOPE_NOTE}`;
  if (regionIn && !live) return { events: [], notice, note: `'${regionIn}' 지역을 알아보지 못했어요. "경남 창원시"처럼 시·도와 시·군·구로 적어 주세요.` };
  if (birthYear && Number(today.slice(0, 4)) - birthYear < ADULT_AGE) return { events: [], notice, note: "만 19세 이상만 볼 수 있어요." };
  const profile: SinglesProfile | null = live || work || birthYear || gender ? { live, work, birthYear, gender } : null;
  const all = sortForList(await listSinglesEvents({ today }), today).filter((e) => ["open", "upcoming"].includes(eventStatus(e, today)));
  const fits = profile ? all.filter((e) => checkEligibility(e, profile, today).verdict !== "no") : all;
  // 지역을 주면 그 시·도에서 열리거나 지역 요건이 그 시·도에 걸친 행사만
  const sido = live?.split(" ")[0];
  const near = sido ? fits.filter((e) => e.sido === sido || e.regionBasis !== "any") : fits;
  const events = near.slice(0, limitOf(args.limit)).map((e) => item(e, today, profile));
  return { events, notice, ...(events.length ? {} : { note: "조건에 맞는 모집 중·예정 행사가 아직 없어요." }) };
}

/** singles_event_detail {event_id}: 요건·일정·신청 방법(원문 링크) */
export async function singlesEventDetailTool(args: Record<string, unknown>, now = new Date()): Promise<Record<string, unknown>> {
  const id = str(args.event_id, 20);
  const e = /^\d{1,18}$/.test(id) ? await getSinglesEvent(id) : null;
  if (!e) return { note: "행사를 찾지 못했어요. find_singles_events 로 번호를 확인해 주세요." };
  const today = todayKst(now);
  return {
    ...item(e, today, null),
    venue: e.venue,
    event_period: periodLabel(e.eventDate, e.eventEnd ?? e.eventDate),
    requirements: {
      birth_years: birthLabel(e) || null,
      quota: quotaLabel(e) || null,
      region: regionRuleLabel(e),
      first_marriage_only: e.firstMarriageOnly,
    },
    fee: e.fee,
    selection: e.selection || null,
    past_competition: e.competitionNote || null,
    notes: e.notes || null,
    how_to_apply: "원문 공지(original_url)에서 직접 신청",
    notice: `${SINGLES_NOTICE} ${SINGLES_SCOPE_NOTE}`,
  };
}
