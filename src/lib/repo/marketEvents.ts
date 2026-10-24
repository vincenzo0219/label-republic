import { query } from "../db";
import { tonightWindow, type Market, type MarketEvent } from "../marketEvents";

const COLS = "id::text, market, starts_at, title, source_url";

/** 오늘 밤 + 다음 7일 일정 (이 시장들만) */
export async function upcomingEvents(markets: readonly Market[], now = new Date()): Promise<MarketEvent[]> {
  const { start, weekEnd } = tonightWindow(now);
  return query<MarketEvent>(
    `SELECT ${COLS} FROM market_events WHERE market = ANY($1::text[]) AND starts_at >= $2 AND starts_at < $3 ORDER BY starts_at, id`,
    [markets, start.toISOString(), weekEnd.toISOString()],
  );
}

/** 운영: 일정 목록 (from 부터) */
export async function listEvents(from: Date, limit = 200): Promise<MarketEvent[]> {
  return query<MarketEvent>(`SELECT ${COLS} FROM market_events WHERE starts_at >= $1 ORDER BY starts_at, id LIMIT $2`, [from.toISOString(), limit]);
}

/** 운영: 일정 넣기. 같은 시장·시각·제목이면 출처만 고친다 */
export async function addEvent(e: { market: Market; startsAt: string; title: string; sourceUrl: string }): Promise<MarketEvent> {
  const [row] = await query<MarketEvent>(
    `INSERT INTO market_events (market, starts_at, title, source_url) VALUES ($1, $2, $3, $4)
     ON CONFLICT (market, starts_at, title) DO UPDATE SET source_url = EXCLUDED.source_url RETURNING ${COLS}`,
    [e.market, e.startsAt, e.title, e.sourceUrl],
  );
  return row!;
}

export async function deleteEvent(id: string): Promise<boolean> {
  return (await query("DELETE FROM market_events WHERE id = $1 RETURNING 1", [id])).length > 0;
}
