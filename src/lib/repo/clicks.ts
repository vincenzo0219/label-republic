/** 페이지 버튼 클릭 저장소 (10/30). 버튼 목록은 src/lib/clicks.ts */
import { CLICK_KEYS } from "../clicks";
import { query } from "../db";
import { kstDay } from "../metrics";

export async function recordClick(page: string, key: string, visitor: string, now = new Date()): Promise<void> {
  await query("INSERT INTO click_events (page, key, visitor_hash, day) VALUES ($1, $2, $3, $4)", [page, key, visitor, kstDay(now)]);
}

export type ClickRow = { key: string; label: string; clicks: number; people: number };
export type ClickStat = { views: number; viewers: number; rows: ClickRow[] };

/** 관리자: 최근 n일 버튼별 클릭·누른 사람, 그 페이지 본 수(체류 비콘 기준) */
export async function clickStats(page: string, path: string, days = 7, now = new Date()): Promise<ClickStat> {
  const from = kstDay(new Date(now.getTime() - (days - 1) * 86_400_000));
  const to = kstDay(now);
  const rows = await query<{ key: string; clicks: number; people: number }>(
    "SELECT key, count(*)::int AS clicks, count(DISTINCT visitor_hash)::int AS people FROM click_events WHERE page = $1 AND day BETWEEN $2 AND $3 GROUP BY key",
    [page, from, to],
  );
  const [v] = await query<{ views: number; viewers: number }>(
    "SELECT count(*)::int AS views, count(DISTINCT visitor_hash)::int AS viewers FROM page_dwell WHERE path = $1 AND day BETWEEN $2 AND $3",
    [path, from, to],
  );
  const labels = CLICK_KEYS[page] ?? {};
  return {
    views: Number(v?.views ?? 0),
    viewers: Number(v?.viewers ?? 0),
    rows: Object.entries(labels).map(([key, label]) => {
      const r = rows.find((x) => x.key === key);
      return { key, label, clicks: Number(r?.clicks ?? 0), people: Number(r?.people ?? 0) };
    }),
  };
}
