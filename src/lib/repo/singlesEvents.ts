/**
 * 💌 미혼남녀 만남 행사 저장소 (092). 행사는 운영자만 넣고 고친다 (POST /api/admin/singles-events).
 * 알림 조건(출생연도·성별·지역)은 사용자가 동의하고 보낸 것만, 푸시 구독에 붙여 둔다.
 */
import { z } from "zod";
import { query } from "../db";
import { HttpError, notFound } from "../errors";
import { isValidArea, SIDOS, districtsOf } from "../instructorRoom";
import {
  ALERT_CONSENT_VERSION,
  MAX_ALERT_AREAS,
  ORGANIZER_TYPE_KEYS,
  REGION_BASIS_KEYS,
  type AlertCriteria,
  type SinglesEvent,
} from "../singlesEvents";
import { subscriptionIdFor } from "./push";

const COLS = `id::text, title, organizer, organizer_type, sido, sigungu, venue,
  to_char(apply_start, 'YYYY-MM-DD') AS apply_start, to_char(apply_end, 'YYYY-MM-DD') AS apply_end,
  to_char(event_date, 'YYYY-MM-DD') AS event_date, to_char(event_end, 'YYYY-MM-DD') AS event_end,
  birth_year_min, birth_year_max, quota_male, quota_female, region_basis, areas, areas_male, areas_female,
  first_marriage_only, fee, selection, competition_note, notes, original_url, to_char(collected_at, 'YYYY-MM-DD') AS collected_at, hidden`;

type Row = {
  id: string; title: string; organizer: string; organizer_type: SinglesEvent["organizerType"]; sido: string; sigungu: string; venue: string;
  apply_start: string | null; apply_end: string | null; event_date: string | null; event_end: string | null;
  birth_year_min: number | null; birth_year_max: number | null; quota_male: number | null; quota_female: number | null;
  region_basis: SinglesEvent["regionBasis"]; areas: string[]; areas_male: string[]; areas_female: string[];
  first_marriage_only: boolean; fee: number | null; selection: string; competition_note: string; notes: string;
  original_url: string; collected_at: string; hidden: boolean;
};

export type StoredSinglesEvent = SinglesEvent & { hidden: boolean };

const toEvent = (r: Row): StoredSinglesEvent => ({
  id: r.id, title: r.title, organizer: r.organizer, organizerType: r.organizer_type, sido: r.sido, sigungu: r.sigungu, venue: r.venue,
  applyStart: r.apply_start, applyEnd: r.apply_end, eventDate: r.event_date, eventEnd: r.event_end,
  birthYearMin: r.birth_year_min, birthYearMax: r.birth_year_max, quotaMale: r.quota_male, quotaFemale: r.quota_female,
  regionBasis: r.region_basis, areas: r.areas, areasMale: r.areas_male, areasFemale: r.areas_female,
  firstMarriageOnly: r.first_marriage_only, fee: r.fee, selection: r.selection, competitionNote: r.competition_note, notes: r.notes,
  originalUrl: r.original_url, collectedAt: r.collected_at, hidden: r.hidden,
});

/** 공개 목록: 내리지 않은 것, 행사가 끝난 지 30일 안 (지난 행사 칸에 잠깐 남는다) */
export async function listSinglesEvents(opts: { today: string; includeHidden?: boolean; limit?: number }): Promise<StoredSinglesEvent[]> {
  const rows = await query<Row>(
    `SELECT ${COLS} FROM singles_events
      WHERE ($2::boolean OR NOT hidden)
        AND COALESCE(event_end, event_date, apply_end, $1::date) >= $1::date - 30
      ORDER BY COALESCE(apply_end, event_date) NULLS LAST, id LIMIT $3`,
    [opts.today, !!opts.includeHidden, Math.min(opts.limit ?? 200, 500)],
  );
  return rows.map(toEvent);
}

export async function getSinglesEvent(id: string, opts: { includeHidden?: boolean } = {}): Promise<StoredSinglesEvent | null> {
  if (!/^\d{1,18}$/.test(id)) return null;
  const [r] = await query<Row>(`SELECT ${COLS} FROM singles_events WHERE id = $1 AND ($2::boolean OR NOT hidden)`, [id, !!opts.includeHidden]);
  return r ? toEvent(r) : null;
}

// ---------------------------------------------------------------------------
// 운영자 입력
// ---------------------------------------------------------------------------
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "날짜가 아니에요");
const area = z.string().trim().refine(isValidArea, "지역은 \"경남\" 또는 \"경남 창원시\" 모양으로");
const year = z.number().int().min(1940).max(2020);
const quota = z.number().int().min(0).max(10000);
/** 사람이 볼 문장에 긴 줄표(—)를 쓰지 않는다 */
const text = (max: number) => z.string().trim().max(max).refine((v) => !v.includes("—"), "긴 줄표 문자(U+2014)는 쓰지 않아요");

export const singlesEventInput = z
  .object({
    title: text(120).pipe(z.string().min(2)),
    organizer: text(80).pipe(z.string().min(2)),
    organizerType: z.enum(ORGANIZER_TYPE_KEYS as [string, ...string[]]),
    sido: z.string().refine((v) => SIDOS.includes(v), "시·도 짧은 이름 (예: 경남)"),
    sigungu: z.string().trim().max(20).default(""),
    venue: text(120).default(""),
    applyStart: ymd.nullable().default(null),
    applyEnd: ymd.nullable().default(null),
    eventDate: ymd.nullable().default(null),
    eventEnd: ymd.nullable().default(null),
    birthYearMin: year.nullable().default(null),
    birthYearMax: year.nullable().default(null),
    quotaMale: quota.nullable().default(null),
    quotaFemale: quota.nullable().default(null),
    regionBasis: z.enum(REGION_BASIS_KEYS as [string, ...string[]]).default("any"),
    areas: z.array(area).max(20).default([]),
    areasMale: z.array(area).max(20).default([]),
    areasFemale: z.array(area).max(20).default([]),
    firstMarriageOnly: z.boolean().default(false),
    fee: z.number().int().min(0).max(10_000_000).nullable().default(null),
    selection: text(20).default(""),
    competitionNote: text(120).default(""),
    notes: text(300).default(""),
    originalUrl: z.string().trim().url().max(500).refine((v) => /^https?:\/\//.test(v), "원문 링크는 http(s) 주소"),
    collectedAt: ymd,
    hidden: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.sigungu && !districtsOf(v.sido).includes(v.sigungu)) ctx.addIssue({ code: "custom", path: ["sigungu"], message: "시·군·구 이름을 확인해 주세요" });
    if (v.applyStart && v.applyEnd && v.applyStart > v.applyEnd) ctx.addIssue({ code: "custom", path: ["applyEnd"], message: "모집 마감이 시작보다 빨라요" });
    if (v.birthYearMin && v.birthYearMax && v.birthYearMin > v.birthYearMax) ctx.addIssue({ code: "custom", path: ["birthYearMax"], message: "출생연도 범위를 확인해 주세요" });
    if (v.regionBasis !== "any" && !v.areas.length && !v.areasMale.length && !v.areasFemale.length)
      ctx.addIssue({ code: "custom", path: ["areas"], message: "지역 요건이 있으면 지역을 넣어 주세요" });
  });
export type SinglesEventInput = z.infer<typeof singlesEventInput>;

const params = (v: SinglesEventInput) => [
  v.title, v.organizer, v.organizerType, v.sido, v.sigungu, v.venue, v.applyStart, v.applyEnd, v.eventDate, v.eventEnd,
  v.birthYearMin, v.birthYearMax, v.quotaMale, v.quotaFemale, v.regionBasis, v.areas, v.areasMale, v.areasFemale,
  v.firstMarriageOnly, v.fee, v.selection, v.competitionNote, v.notes, v.originalUrl, v.collectedAt, v.hidden,
];

export async function createSinglesEvent(v: SinglesEventInput): Promise<StoredSinglesEvent> {
  const [r] = await query<Row>(
    `INSERT INTO singles_events (title, organizer, organizer_type, sido, sigungu, venue, apply_start, apply_end, event_date, event_end,
       birth_year_min, birth_year_max, quota_male, quota_female, region_basis, areas, areas_male, areas_female,
       first_marriage_only, fee, selection, competition_note, notes, original_url, collected_at, hidden)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::text[], $17::text[], $18::text[], $19, $20, $21, $22, $23, $24, $25, $26)
     RETURNING ${COLS}`,
    params(v),
  );
  return toEvent(r!);
}

export async function updateSinglesEvent(id: string, v: SinglesEventInput): Promise<StoredSinglesEvent> {
  if (!/^\d{1,18}$/.test(id)) throw notFound("행사");
  const [r] = await query<Row>(
    `UPDATE singles_events SET title = $1, organizer = $2, organizer_type = $3, sido = $4, sigungu = $5, venue = $6,
       apply_start = $7, apply_end = $8, event_date = $9, event_end = $10, birth_year_min = $11, birth_year_max = $12,
       quota_male = $13, quota_female = $14, region_basis = $15, areas = $16::text[], areas_male = $17::text[], areas_female = $18::text[],
       first_marriage_only = $19, fee = $20, selection = $21, competition_note = $22, notes = $23, original_url = $24,
       collected_at = $25, hidden = $26, updated_at = now()
     WHERE id = $27 RETURNING ${COLS}`,
    [...params(v), id],
  );
  if (!r) throw notFound("행사");
  return toEvent(r);
}

export async function setSinglesEventHidden(id: string, hidden: boolean): Promise<boolean> {
  if (!/^\d{1,18}$/.test(id)) return false;
  const rows = await query("UPDATE singles_events SET hidden = $2, updated_at = now() WHERE id = $1 RETURNING 1", [id, hidden]);
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// 🔔 알림 조건 (동의한 사람만)
// ---------------------------------------------------------------------------
export type SinglesAlert = AlertCriteria;

export async function getSinglesAlert(endpoint: string, token: string): Promise<SinglesAlert | null> {
  const subId = await subscriptionIdFor(endpoint, token);
  const [r] = await query<{ birth_year: number | null; gender: "male" | "female" | null; areas: string[] }>(
    "SELECT birth_year, gender, areas FROM singles_alert_subs WHERE subscription_id = $1",
    [subId],
  );
  return r ? { birthYear: r.birth_year, gender: r.gender, areas: r.areas } : null;
}

/** 켜기·바꾸기 (consent 가 지금 동의문 판이어야 한다) · 끄기(on=false: 바로 지운다) */
export async function setSinglesAlert(
  endpoint: string,
  token: string,
  input: { on: boolean; consent?: string; birthYear?: number | null; gender?: "male" | "female" | null; areas?: string[] },
): Promise<SinglesAlert | null> {
  const subId = await subscriptionIdFor(endpoint, token);
  if (!input.on) {
    await query("DELETE FROM singles_alert_subs WHERE subscription_id = $1", [subId]);
    return null;
  }
  if (input.consent !== ALERT_CONSENT_VERSION) throw new HttpError(400, "consent_required", "알림 조건 저장에 동의해 주세요.");
  const areas = [...new Set(input.areas ?? [])].filter(isValidArea).slice(0, MAX_ALERT_AREAS);
  const by = input.birthYear ?? null;
  const gender = input.gender ?? null;
  await query(
    `INSERT INTO singles_alert_subs (subscription_id, birth_year, gender, areas, consent_version) VALUES ($1, $2, $3, $4::text[], $5)
     ON CONFLICT (subscription_id) DO UPDATE SET birth_year = EXCLUDED.birth_year, gender = EXCLUDED.gender, areas = EXCLUDED.areas,
       consent_version = EXCLUDED.consent_version, consent_at = now()`,
    [subId, by, gender, areas, ALERT_CONSENT_VERSION],
  );
  return { birthYear: by, gender, areas };
}
