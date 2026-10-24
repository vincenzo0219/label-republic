/**
 * 📡 내일장 레이더 (10/24, 주식 방). 지난밤 숫자만 (지수 마감·야간선물·환율·ADR·수급·보도된 원인), 전망·의견 없음.
 * 운영이 PUT /api/admin/market-radar 로 매일 아침 바꾼다 (market_radar 표). 빠진 칸은 줄째 안 보인다.
 */
import { z } from "zod";
import { STOCK_ROOM } from "./investRooms";

export const RADAR_ROOMS: ReadonlySet<string> = new Set([STOCK_ROOM]);

const pct = z.number().finite().min(-100).max(1000);
const url = z.string().trim().url().max(500);
const label = z.string().trim().min(1).max(30);

export const radarSchema = z.object({
  /** 기준 시각 (ISO 8601, 시간대 포함) */
  asOf: z.string().refine((v) => /[zZ]|[+-]\d{2}:\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)), "시간대가 붙은 ISO 시각이어야 해요."),
  /** 미국 3대 지수 마감 등락률(%) */
  indices: z.array(z.object({ name: label, pct })).max(5).optional(),
  /** 코스피200 야간선물 등락률(%) */
  kospiNight: z.object({ pct }).optional(),
  /** 원/달러 (원), change: 전일 대비 (원) */
  usdkrw: z.object({ value: z.number().finite().positive().max(100_000), change: z.number().finite().optional() }).optional(),
  /** ADR: 국내 종가 환산 등락률(%)이 있으면 */
  adrs: z.array(z.object({ name: label, pct: pct.optional() })).max(10).optional(),
  /** 전일 외국인·기관 순매수 (억 원, 음수는 순매도) */
  flows: z.object({ foreign: z.number().finite().optional(), institution: z.number().finite().optional() }).optional(),
  /** 보도된 원인 한 줄 + 기사 */
  cause: z.object({ text: z.string().trim().min(2).max(80), url }).optional(),
  sources: z.array(z.object({ label, url })).max(6).optional(),
});
export type Radar = z.infer<typeof radarSchema>;

const H = 3600_000;

/** 평일(KST 월~금)에 기준 시각이 24시간보다 오래되면 숨긴다. 주말엔 금요일 숫자를 둔다 */
export function radarVisible(r: Pick<Radar, "asOf"> | null | undefined, now = new Date()): boolean {
  if (!r) return false;
  const at = Date.parse(r.asOf);
  if (Number.isNaN(at) || at > now.getTime() + H) return false;
  const dow = new Date(now.getTime() + 9 * H).getUTCDay();
  const weekday = dow >= 1 && dow <= 5;
  return !(weekday && now.getTime() - at > 24 * H);
}

const sign = (n: number, digits = 2) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}`;
export const fmtPct = (n: number) => `${sign(n)}%`;
const fmtWon = (n: number) => `${sign(n, 0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}억`;

export type RadarRow = { label: string; value: string };

/** 화면에 보일 줄 (값이 있는 것만) */
export function radarRows(r: Radar): RadarRow[] {
  const rows: RadarRow[] = [];
  if (r.indices?.length) rows.push({ label: "미국 마감", value: r.indices.map((i) => `${i.name} ${fmtPct(i.pct)}`).join(" · ") });
  if (r.kospiNight) rows.push({ label: "코스피200 야간선물", value: fmtPct(r.kospiNight.pct) });
  if (r.usdkrw)
    rows.push({
      label: "원/달러",
      value: `${r.usdkrw.value.toLocaleString("en-US", { maximumFractionDigits: 2 })}${r.usdkrw.change !== undefined ? ` (${sign(r.usdkrw.change, 1)})` : ""}`,
    });
  if (r.adrs?.length) rows.push({ label: "ADR", value: r.adrs.map((a) => (a.pct !== undefined ? `${a.name} ${fmtPct(a.pct)}` : a.name)).join(" · ") });
  const f = r.flows;
  if (f && (f.foreign !== undefined || f.institution !== undefined))
    rows.push({
      label: "전일 순매수",
      value: [f.foreign !== undefined && `외국인 ${fmtWon(f.foreign)}`, f.institution !== undefined && `기관 ${fmtWon(f.institution)}`].filter(Boolean).join(" · "),
    });
  return rows;
}

/** "10/24 07:40 기준" (KST) */
export function radarAsOf(asOf: string): string {
  const d = new Date(Date.parse(asOf) + 9 * H).toISOString();
  return `${d.slice(5, 7)}/${d.slice(8, 10)} ${d.slice(11, 16)} 기준`;
}
