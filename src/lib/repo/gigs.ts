/**
 * 📋 대강·구인 (🧘 요가·필라테스 강사방, 10/25). src/lib/instructorRoom.ts
 * 연락처(contact)는 목록·상세 기본 응답에 넣지 않고 gigContact 로만 꺼낸다.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { query } from "../db";
import { config } from "../config";
import { HttpError, notFound } from "../errors";
import { hashPin } from "../password";
import { assertPin } from "./pin-guard";
import { subscriptionIdFor } from "./push";
import { ownerAlertAfter } from "./ownerAlert";
import { aiAbuse, heuristicAbuse, maskPersonalInfo } from "../abuse";
import { aiSpam, combine, heuristicSpam, shouldSuppress } from "../moderation";
import { getRule } from "./rules";
import {
  CLASS_TYPES,
  DUP_MESSAGE,
  DUP_WINDOW_MS,
  addDays,
  contactKey,
  dupText,
  expiresOn,
  gigProblem,
  isUrgent,
  isValidArea,
  kstDow,
  kstYmd,
  nearlySame,
  weekEnd,
  type ClassType,
  type GigInput,
  type GigKind,
} from "../instructorRoom";

export type GigCard = {
  id: string;
  kind: GigKind;
  studio: string;
  sido: string;
  sigungu: string;
  station: string;
  dates: string[];
  weekdays: number[];
  times: string[];
  classType: ClassType;
  equipment: string[];
  pay: number | null;
  tax: boolean | null;
  nickname: string;
  createdAt: string;
  urgent: boolean;
};

export type GigDetail = GigCard & {
  address: string;
  payday: string;
  notes: string;
  closed: boolean;
  expired: boolean;
  hidden: boolean;
};

type Row = {
  id: string;
  kind: GigKind;
  studio: string;
  sido: string;
  sigungu: string;
  station: string;
  address: string;
  dates: string[];
  weekdays: number[];
  times: string[];
  class_type: ClassType;
  equipment: string[];
  pay: number | null;
  tax_deducted: boolean | null;
  payday: string;
  notes: string;
  nickname: string;
  created_at: string;
  expires_on: string;
  closed_at: string | null;
  ai_hidden_reason: string | null;
};

const COLS = `id::text, kind, studio, sido, sigungu, station, address, dates::text[] AS dates, weekdays::int[] AS weekdays, times, class_type, equipment,
  pay, tax_deducted, payday, notes, nickname, created_at, expires_on::text AS expires_on, closed_at, ai_hidden_reason`;

function card(r: Row, now: Date): GigCard {
  return {
    id: r.id,
    kind: r.kind,
    studio: r.studio,
    sido: r.sido,
    sigungu: r.sigungu,
    station: r.station,
    dates: r.dates,
    weekdays: r.weekdays,
    times: r.times,
    classType: r.class_type,
    equipment: r.equipment,
    pay: r.pay,
    tax: r.tax_deducted,
    nickname: r.nickname,
    createdAt: r.created_at,
    urgent: isUrgent({ kind: r.kind, dates: r.dates, times: r.times }, now),
  };
}

/** 같은 글 비교용: "지역·날짜·시간 열쇠#글자" — 열쇠가 같고 글자(업체·수업·페이·요청사항)가 거의 같으면 같은 글 */
const canonical = (g: GigInput) =>
  `${[g.kind, g.sido, g.sigungu, [...g.dates].sort().join(","), [...g.weekdays].sort().join(""), [...g.times].sort().join(",")].join("|")}#${dupText([g.studio, g.classType, g.pay ?? "", g.notes].join("|"))}`;
const sameGig = (a: string, b: string) => {
  const [ka, ta = ""] = a.split("#");
  const [kb, tb = ""] = b.split("#");
  return ka === kb && (ta === tb || nearlySame(ta, tb));
};

/** 공개 글에 두지 않을 표현 (욕설·혐오·위협). 연락처는 일부러 받는 칸이라 개인정보 규칙은 빼고 본다 */
function abuseIn(g: GigInput): string | null {
  const v = heuristicAbuse(maskPersonalInfo([g.studio, g.address, g.payday, g.notes].join("\n")).text);
  return v && v.category !== "personal_info" ? v.category : null;
}

export async function createGig(
  g: GigInput,
  who: { fingerprint: string; net: string | null },
  now = new Date(),
): Promise<{ id: string }> {
  const today = kstYmd(now);
  const input: GigInput = {
    ...g,
    dates: [...new Set(g.dates)].sort(),
    weekdays: [...new Set(g.weekdays)].sort((a, b) => a - b),
    times: [...new Set(g.times)].sort(),
    equipment: [...new Set(g.equipment)],
  };
  const problem = gigProblem(input, today);
  if (problem) throw new HttpError(400, "invalid_gig", problem);
  if (abuseIn(input)) throw new HttpError(400, "abuse", "올릴 수 없는 표현이 있어요");

  const dup = canonical(input);
  const ck = contactKey(input.contact);
  // 같은 사람(이 브라우저·닉네임·같은 연락처)이 24시간 안에 거의 같은 글을 올렸으면 그대로 둔다
  const recent = await query<{ id: string; dup_text: string }>(
    `SELECT id::text, dup_text FROM gig_listings
      WHERE created_at > $1::timestamptz AND closed_at IS NULL
        AND (author_fingerprint = $2 OR nickname = $3 OR (contact_key <> '' AND contact_key = $4))
      ORDER BY id DESC LIMIT 20`,
    [new Date(now.getTime() - DUP_WINDOW_MS).toISOString(), who.fingerprint, input.nickname, ck],
  );
  const same = recent.find((r) => sameGig(r.dup_text, dup));
  if (same) throw Object.assign(new HttpError(409, "duplicate_gig", DUP_MESSAGE), { gigId: same.id });

  const [row] = await query<{ id: string }>(
    `INSERT INTO gig_listings (kind, studio, sido, sigungu, station, address, dates, weekdays, times, class_type, equipment, pay, tax_deducted,
                               payday, contact, notes, nickname, pw_hash, author_fingerprint, author_net, dup_text, contact_key, expires_on, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::date[], $8::smallint[], $9::text[], $10, $11::text[], $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23::date, $24, $24)
     RETURNING id::text`,
    [
      input.kind,
      input.studio,
      input.sido,
      input.sigungu,
      input.station,
      input.address,
      input.dates,
      input.weekdays,
      input.times,
      input.classType,
      input.equipment,
      input.pay,
      input.tax,
      input.payday,
      input.contact,
      input.notes,
      input.nickname,
      await hashPin(input.pw),
      who.fingerprint,
      who.net,
      dup,
      ck,
      expiresOn(input.kind, input.dates, today),
      now.toISOString(),
    ],
  );
  // 🔔 운영자 기기로 바로 (10/25)
  ownerAlertAfter({ kind: "gig", nickname: input.nickname, fingerprint: who.fingerprint }, { kind: "gig", gigId: row!.id, text: [input.studio, input.sigungu || input.sido, input.classType].filter(Boolean).join(" · ") });
  return { id: row!.id };
}

/** 올린 직후 AI 운영 (키가 있을 때만): 욕설·혐오·인신공격, 광고·스팸이면 목록에서 가린다 */
export async function moderateGig(id: string): Promise<void> {
  const [r] = await query<{ studio: string; notes: string; address: string }>("SELECT studio, notes, address FROM gig_listings WHERE id = $1", [id]);
  if (!r) return;
  const text = maskPersonalInfo([r.studio, r.address, r.notes].join("\n")).text;
  const [abuse, spam] = await Promise.all([aiAbuse(text), aiSpam(r.studio, `${r.address}\n${r.notes}`)]);
  const verdict = spam ? combine(heuristicSpam(r.studio, r.notes), spam) : null;
  const reason = abuse && abuse.category !== "personal_info" ? abuse.category : verdict && shouldSuppress(verdict, await getRule("spam_suppress_score")) ? "spam" : null;
  if (reason) await query("UPDATE gig_listings SET ai_hidden_reason = $2, ai_hidden_note = $3 WHERE id = $1 AND ai_hidden_reason IS NULL", [id, reason, (abuse?.evidence ?? verdict?.reasons.join(", ") ?? "").slice(0, 200)]);
}

export type GigFilter = { sido?: string; sigungu?: string; when?: "today" | "week"; classType?: ClassType; kind?: GigKind; page?: number };
export const GIG_PAGE = 30;

/** 공개 목록: 마감·가림·날짜 지난 글 빼고 최신순 */
export async function listGigs(f: GigFilter, now = new Date()): Promise<{ items: GigCard[]; total: number; page: number }> {
  const today = kstYmd(now);
  const where = ["closed_at IS NULL", "ai_hidden_reason IS NULL", "expires_on >= $1::date"];
  const params: unknown[] = [today];
  const p = (v: unknown) => (params.push(v), `$${params.length}`);
  if (f.sido) where.push(`sido = ${p(f.sido)}`);
  if (f.sido && f.sigungu) where.push(`sigungu = ${p(f.sigungu)}`);
  if (f.classType) where.push(`class_type = ${p(f.classType)}`);
  if (f.kind) where.push(`kind = ${p(f.kind)}`);
  if (f.when === "today") where.push(`($1::date = ANY(dates) OR (kind = 'regular' AND ${p(kstDow(now))}::smallint = ANY(weekdays)))`);
  if (f.when === "week") where.push(`(EXISTS (SELECT 1 FROM unnest(dates) d WHERE d BETWEEN $1::date AND ${p(weekEnd(today))}::date) OR kind = 'regular')`);
  const page = Math.max(1, Math.min(50, f.page ?? 1));
  const w = where.join(" AND ");
  const [rows, [count]] = await Promise.all([
    query<Row>(`SELECT ${COLS} FROM gig_listings WHERE ${w} ORDER BY created_at DESC, id DESC LIMIT ${GIG_PAGE} OFFSET ${(page - 1) * GIG_PAGE}`, params),
    query<{ n: number }>(`SELECT count(*)::int AS n FROM gig_listings WHERE ${w}`, params),
  ]);
  return { items: rows.map((r) => card(r, now)), total: count?.n ?? 0, page };
}

export async function getGig(id: string, now = new Date()): Promise<GigDetail | null> {
  if (!/^\d{1,18}$/.test(id)) return null;
  const [r] = await query<Row>(`SELECT ${COLS} FROM gig_listings WHERE id = $1`, [id]);
  if (!r) return null;
  return {
    ...card(r, now),
    address: r.address,
    payday: r.payday,
    notes: r.notes,
    closed: !!r.closed_at,
    expired: r.expires_on < kstYmd(now),
    hidden: !!r.ai_hidden_reason,
  };
}

/** 연락처: 마감·가림·지난 글은 주지 않는다 */
export async function gigContact(id: string, now = new Date()): Promise<string> {
  const g = await getGig(id, now);
  if (!g || g.hidden) throw notFound("글");
  if (g.closed || g.expired) throw new HttpError(410, "gig_closed", "마감된 글이에요");
  const [r] = await query<{ contact: string }>("SELECT contact FROM gig_listings WHERE id = $1", [id]);
  return r!.contact;
}

/** 글쓴이 마감 (글 비밀번호) */
export async function closeGig(id: string, fp: string, pin: string): Promise<void> {
  if (!/^\d{1,18}$/.test(id)) throw notFound("글");
  const [r] = await query<{ pw_hash: string }>("SELECT pw_hash FROM gig_listings WHERE id = $1", [id]);
  if (!r) throw notFound("글");
  await assertPin(`gig:${id}`, fp, pin, r.pw_hash);
  await query("UPDATE gig_listings SET closed_at = COALESCE(closed_at, now()), updated_at = now() WHERE id = $1", [id]);
}

// ---------------------------------------------------------------------------
// 🔔 지역·수업 알림
// ---------------------------------------------------------------------------
export const MAX_ALERT_AREAS = 5;

export type GigAlert = { areas: string[]; classes: string[] };

export async function getGigAlert(endpoint: string, token: string): Promise<GigAlert | null> {
  const subId = await subscriptionIdFor(endpoint, token);
  const [r] = await query<GigAlert>("SELECT areas, classes FROM gig_alert_subs WHERE subscription_id = $1", [subId]);
  return r ?? null;
}

/** areas 가 비면 끈다 */
export async function setGigAlert(endpoint: string, token: string, areas: string[], classes: string[], now = new Date()): Promise<GigAlert | null> {
  const subId = await subscriptionIdFor(endpoint, token);
  const a = [...new Set(areas)].filter(isValidArea).slice(0, MAX_ALERT_AREAS);
  const c = [...new Set(classes)].filter((x) => (CLASS_TYPES as readonly string[]).includes(x));
  if (!a.length) {
    await query("DELETE FROM gig_alert_subs WHERE subscription_id = $1", [subId]);
    return null;
  }
  await query(
    `INSERT INTO gig_alert_subs (subscription_id, areas, classes, checked_until) VALUES ($1, $2::text[], $3::text[], $4)
     ON CONFLICT (subscription_id) DO UPDATE SET areas = EXCLUDED.areas, classes = EXCLUDED.classes, updated_at = now()`,
    [subId, a, c, now.toISOString()],
  );
  return { areas: a, classes: c };
}

/** 알림 속 "알림 끄기" 한 번 누르기용 증표 (구독 번호 + HMAC) — 푸시 주소·토큰 없이도 그 구독의 대강 알림만 끈다 */
export function gigOffToken(subId: string): string {
  return `${subId}.${createHmac("sha256", config.appSecret).update(`gig-off:${subId}`).digest("base64url").slice(0, 22)}`;
}

export async function offGigAlertByToken(tok: string): Promise<boolean> {
  const [subId, sig] = tok.split(".");
  if (!subId || !sig || !/^\d{1,18}$/.test(subId)) return false;
  const want = Buffer.from(gigOffToken(subId));
  const got = Buffer.from(tok);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return false;
  await query("DELETE FROM gig_alert_subs WHERE subscription_id = $1", [subId]);
  return true;
}

/** 오늘·이번 주 같은 화면 문구에 쓰는 날짜 (테스트용으로 밖에서도) */
export const gigToday = (now = new Date()) => ({ today: kstYmd(now), tomorrow: addDays(kstYmd(now), 1) });
