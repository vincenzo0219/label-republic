/**
 * 📅 오늘 밤 미국장 (10/24, 미국주식방·주식). 일정(실적 발표·FOMC·CPI·고용·휴장)만, 시세·의견은 없다.
 * 일정은 market_events 표 (마이그레이션 083 이 공식 출처로 확인한 날짜만 넣었고, 운영은 POST /api/admin/market-events 로 보탠다).
 */
import { STOCK_ROOM, US_STOCK_ROOM } from "./investRooms";

export type Market = "us" | "kr";
export type MarketEvent = { id: string; market: Market; starts_at: string; title: string; source_url: string };

/** 방마다 보이는 시장 (주식 방은 국내+미국) */
export const MARKET_ROOMS: Record<string, readonly Market[]> = {
  [US_STOCK_ROOM]: ["us"],
  [STOCK_ROOM]: ["us", "kr"],
};

const H = 3600_000;
const KST = 9 * H;

/**
 * 오늘 밤: KST 오늘 12시부터 내일 12시까지. 미국 장 전 실적(밤 9시쯤), CPI·고용(밤 10시 반), FOMC(새벽 3~4시),
 * 장 마감 뒤 실적(새벽 6~7시)이 한 장에 들어간다. 다음 주: 그 뒤 7일.
 */
export function tonightWindow(now = new Date()): { start: Date; end: Date; weekEnd: Date } {
  const kstDay = new Date(now.getTime() + KST).toISOString().slice(0, 10);
  const start = new Date(Date.parse(`${kstDay}T12:00:00+09:00`));
  const end = new Date(start.getTime() + 24 * H);
  return { start, end, weekEnd: new Date(end.getTime() + 7 * 24 * H) };
}

/** 오늘 밤 / 다음 7일로 나눈다 (시간순) */
export function splitEvents(events: readonly MarketEvent[], now = new Date()): { tonight: MarketEvent[]; week: MarketEvent[] } {
  const { start, end, weekEnd } = tonightWindow(now);
  const sorted = [...events].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const t = (e: MarketEvent) => Date.parse(e.starts_at);
  return {
    tonight: sorted.filter((e) => t(e) >= start.getTime() && t(e) < end.getTime()),
    week: sorted.filter((e) => t(e) >= end.getTime() && t(e) < weekEnd.getTime()),
  };
}

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
/** KST "03:00" */
export const kstTime = (iso: string) => new Date(Date.parse(iso) + KST).toISOString().slice(11, 16);
/** KST "11/2(월)" */
export function kstDate(iso: string): string {
  const d = new Date(Date.parse(iso) + KST);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${DOW[d.getUTCDay()]})`;
}
