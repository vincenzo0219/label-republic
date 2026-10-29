/**
 * 🔔 테니스방 알림 (10/29): 1) 우리 동네 새 게임 알림 구독  2) 공공 코트 예약 오픈 규칙(운영자)·구독
 */
import { query } from "../db";
import { HttpError, notFound } from "../errors";
import { isValidArea } from "../instructorRoom";
import { GAME_TYPES } from "../tennisGames";
import { TENNIS_ALERT_MAX_AREAS, type CourtOpen } from "../tennisAlerts";
import { subscriptionIdFor } from "./push";

// ---------------------------------------------------------------------------
// 1) 우리 동네 새 게임 알림
// ---------------------------------------------------------------------------
export type TennisAlert = { areas: string[]; types: string[] };

export async function getTennisAlert(endpoint: string, token: string): Promise<TennisAlert | null> {
  const subId = await subscriptionIdFor(endpoint, token);
  const [r] = await query<TennisAlert>("SELECT areas, types FROM tennis_alert_subs WHERE subscription_id = $1", [subId]);
  return r ?? null;
}

/** areas 가 비면 끈다 */
export async function setTennisAlert(endpoint: string, token: string, areas: string[], types: string[], now = new Date()): Promise<TennisAlert | null> {
  const subId = await subscriptionIdFor(endpoint, token);
  const a = [...new Set(areas)].filter(isValidArea).slice(0, TENNIS_ALERT_MAX_AREAS);
  const t = [...new Set(types)].filter((x) => (GAME_TYPES as readonly string[]).includes(x));
  if (!a.length) {
    await query("DELETE FROM tennis_alert_subs WHERE subscription_id = $1", [subId]);
    return null;
  }
  await query(
    `INSERT INTO tennis_alert_subs (subscription_id, areas, types, checked_until) VALUES ($1, $2::text[], $3::text[], $4)
     ON CONFLICT (subscription_id) DO UPDATE SET areas = EXCLUDED.areas, types = EXCLUDED.types, updated_at = now()`,
    [subId, a, t, now.toISOString()],
  );
  return { areas: a, types: t };
}

// ---------------------------------------------------------------------------
// 2) 공공 코트 예약 오픈
// ---------------------------------------------------------------------------
const COURT_COLS = "id, court, sido, sigungu, open_days::int[] AS open_days, open_time, booking_url, source_url, note, last_verified::text AS last_verified, active";

export async function listCourtOpens(opts: { all?: boolean } = {}): Promise<CourtOpen[]> {
  return query<CourtOpen>(`SELECT ${COURT_COLS} FROM court_opens ${opts.all ? "" : "WHERE active"} ORDER BY sido, court`);
}

export type CourtOpenInput = Omit<CourtOpen, "id"> & { id?: number };

const URL_RE = /^https:\/\/[^\s]{3,290}$/;

/** 운영자: 규칙 넣기·고치기 (id 가 있으면 그 줄, 없으면 court+sido 로 덮어쓰기) */
export async function upsertCourtOpen(c: CourtOpenInput): Promise<CourtOpen> {
  const days = [...new Set(c.open_days)].filter((d) => Number.isInteger(d) && d >= 1 && d <= 31).sort((a, b) => a - b);
  if (!days.length) throw new HttpError(400, "invalid_input", "오픈일(1~31)을 하나 이상 넣어 주세요");
  if (c.open_time && !/^\d{2}:\d{2}$/.test(c.open_time)) throw new HttpError(400, "invalid_input", "시각은 HH:MM");
  if (!URL_RE.test(c.booking_url) || !URL_RE.test(c.source_url)) throw new HttpError(400, "invalid_input", "예약·출처 주소는 https 로 시작해야 해요");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.last_verified)) throw new HttpError(400, "invalid_input", "확인한 날짜(YYYY-MM-DD)를 넣어 주세요");
  const args = [c.court.trim(), c.sido.trim(), c.sigungu.trim(), days, c.open_time, c.booking_url, c.source_url, c.note.trim(), c.last_verified, c.active];
  if (c.id) {
    const [r] = await query<CourtOpen>(
      `UPDATE court_opens SET court = $2, sido = $3, sigungu = $4, open_days = $5::smallint[], open_time = $6, booking_url = $7, source_url = $8,
              note = $9, last_verified = $10::date, active = $11, updated_at = now() WHERE id = $1 RETURNING ${COURT_COLS}`,
      [c.id, ...args],
    );
    if (!r) throw notFound("코트");
    return r;
  }
  const [r] = await query<CourtOpen>(
    `INSERT INTO court_opens (court, sido, sigungu, open_days, open_time, booking_url, source_url, note, last_verified, active)
     VALUES ($1, $2, $3, $4::smallint[], $5, $6, $7, $8, $9::date, $10)
     ON CONFLICT (court, sido) DO UPDATE SET sigungu = EXCLUDED.sigungu, open_days = EXCLUDED.open_days, open_time = EXCLUDED.open_time,
       booking_url = EXCLUDED.booking_url, source_url = EXCLUDED.source_url, note = EXCLUDED.note, last_verified = EXCLUDED.last_verified,
       active = EXCLUDED.active, updated_at = now()
     RETURNING ${COURT_COLS}`,
    args,
  );
  return r!;
}

export async function deleteCourtOpen(id: number): Promise<void> {
  const r = await query("DELETE FROM court_opens WHERE id = $1 RETURNING id", [id]);
  if (!r.length) throw notFound("코트");
}

/** 이 브라우저가 알림 받는 코트 번호들 */
export async function getCourtSubs(endpoint: string, token: string): Promise<number[]> {
  const subId = await subscriptionIdFor(endpoint, token);
  const rows = await query<{ court_id: number }>("SELECT court_id FROM court_open_subs WHERE subscription_id = $1 ORDER BY court_id", [subId]);
  return rows.map((r) => r.court_id);
}

/** 코트 알림 켜고 끄기 (켜진 코트만 받는다) */
export async function setCourtSub(endpoint: string, token: string, courtId: number, on: boolean): Promise<number[]> {
  const subId = await subscriptionIdFor(endpoint, token);
  if (on) {
    const r = await query("INSERT INTO court_open_subs (subscription_id, court_id) SELECT $1, id FROM court_opens WHERE id = $2 AND active ON CONFLICT DO NOTHING RETURNING court_id", [subId, courtId]);
    if (!r.length) {
      const ex = await query("SELECT 1 FROM court_opens WHERE id = $1 AND active", [courtId]);
      if (!ex.length) throw notFound("코트");
    }
  } else await query("DELETE FROM court_open_subs WHERE subscription_id = $1 AND court_id = $2", [subId, courtId]);
  return getCourtSubs(endpoint, token);
}
