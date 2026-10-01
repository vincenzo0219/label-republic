/**
 * 라벨 날짜 — 제조일자·유통기한 (Sprint 26). 서버·클라이언트 공용 순수 함수.
 *
 * 리뉴얼 판단(src/lib/renewals.ts)의 "시점"을 글을 올린 시각 대신 제품이 만들어진 시기로 잡기 위해 쓴다.
 * 오래 묵힌 제품을 늦게 올린 글이 새 라벨 시기에 섞이지 않게 된다.
 *
 *   - 제조일자가 있으면 그것
 *   - 유통기한만 있으면 유통기한 − 이 제품의 유통기한 길이(두 날짜를 다 적은 글들의 중앙값, 없으면 방 기본값)
 *   - 날짜가 없으면 글 올린 시각 − 이 제품의 "제조 → 글" 간격(날짜를 적은 글들의 중앙값, 없으면 0)
 */

export type DatePrecision = "day" | "month";
export type LabelDate = { iso: string; precision: DatePrecision };

const DAY = 86_400_000;
/** 제조일자는 미래일 수 없다 (시차·표기 여유 한 달) */
const MADE_FUTURE_DAYS = 31;
const MAX_YEARS = 15;
/** 이보다 오래된 제조일자는 받지 않는다 (Sprint 29 — 아주 옛 날짜로 유통기한 길이 추정을 흔드는 것 방지) */
const MADE_MAX_AGE_YEARS = 10;
const MIN_YEAR = 2000;

/** 방별 흔한 유통기한 길이(개월) — 제품에 두 날짜를 다 적은 글이 없을 때만 쓴다 */
export const DEFAULT_SHELF_MONTHS: Record<string, number> = {
  supplements: 24,
  "pet-food": 18,
  "perfume-audio": 36,
};
export const FALLBACK_SHELF_MONTHS = 24;

function valid(y: number, m: number, d?: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || y < MIN_YEAR || y > 2100 || m < 1 || m > 12) return false;
  if (d === undefined) return true;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Number.isInteger(d) && d >= 1 && d <= last;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * 라벨에 흔한 표기를 읽는다: 2026-03-15, 2026.03.15, 2026/3/5, 20260315, 2026-03, 2026.3, 03/2027, 26.03.15
 * 읽을 수 없으면 null.
 */
export function parseLabelDate(raw: string): LabelDate | null {
  const s = raw.normalize("NFKC").trim().replace(/\s+/g, "").replace(/[년월]/g, ".").replace(/일$/, "").replace(/\.$/, "");
  if (!s) return null;
  let m: RegExpMatchArray | null;
  let y: number, mo: number, d: number | undefined;
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) [y, mo, d] = [+m[1]!, +m[2]!, +m[3]!];
  else if ((m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/))) [y, mo, d] = [+m[1]!, +m[2]!, +m[3]!];
  else if ((m = s.match(/^(\d{2})[-./](\d{1,2})[-./](\d{1,2})$/))) [y, mo, d] = [2000 + +m[1]!, +m[2]!, +m[3]!];
  else if ((m = s.match(/^(\d{4})[-./](\d{1,2})$/))) [y, mo] = [+m[1]!, +m[2]!];
  else if ((m = s.match(/^(\d{1,2})[-./](\d{4})$/))) [y, mo] = [+m[2]!, +m[1]!];
  else return null;
  if (!valid(y, mo, d)) return null;
  return d === undefined ? { iso: `${y}-${pad(mo)}`, precision: "month" } : { iso: `${y}-${pad(mo)}-${pad(d)}`, precision: "day" };
}

/** 날짜의 대표 시각(ms, UTC). 월까지만 알면 그 달 15일 */
export function labelDateMs(d: LabelDate): number {
  const [y, m, day] = d.iso.split("-").map(Number) as [number, number, number?];
  return Date.UTC(y, m - 1, d.precision === "month" ? 15 : day!);
}

/** "2026.03" / "2026.03.15" */
export function formatLabelDate(d: LabelDate): string {
  return d.iso.replaceAll("-", ".");
}

/** 제조일자·유통기한 검사 — 문제가 있으면 이유 */
export function labelDatesProblem(made: LabelDate | null, expires: LabelDate | null, now = Date.now()): string | null {
  if (made && labelDateMs(made) > now + MADE_FUTURE_DAYS * DAY) return "제조일자가 미래예요. 유통기한을 제조일자 칸에 적지 않았는지 확인해주세요.";
  if (made && labelDateMs(made) < now - MADE_MAX_AGE_YEARS * 365 * DAY) return `제조일자가 ${MADE_MAX_AGE_YEARS}년보다 오래됐어요. 날짜를 확인해주세요.`;
  if (expires && labelDateMs(expires) > now + MAX_YEARS * 365 * DAY) return `유통기한이 ${MAX_YEARS}년보다 멀어요. 날짜를 확인해주세요.`;
  if (made && expires) {
    const a = labelDateMs(made);
    const b = labelDateMs(expires);
    if (b <= a) return "유통기한이 제조일자보다 빨라요. 두 칸이 바뀌지 않았는지 확인해주세요.";
    if (b - a > MAX_YEARS * 365 * DAY) return "제조일자와 유통기한이 너무 멀어요. 날짜를 확인해주세요.";
  }
  return null;
}

/** 입력 문자열 두 개 → 검사한 날짜 (빈 칸은 null). 문제가 있으면 { problem } */
export function readLabelDates(madeRaw: string, expiresRaw: string, now = Date.now()): { made: LabelDate | null; expires: LabelDate | null } | { problem: string } {
  const made = madeRaw.trim() ? parseLabelDate(madeRaw) : null;
  if (madeRaw.trim() && !made) return { problem: "제조일자를 읽을 수 없어요 (예: 2026-03 또는 2026-03-15)." };
  const expires = expiresRaw.trim() ? parseLabelDate(expiresRaw) : null;
  if (expiresRaw.trim() && !expires) return { problem: "유통기한을 읽을 수 없어요 (예: 2028-03 또는 2028-03-14)." };
  const problem = labelDatesProblem(made, expires, now);
  return problem ? { problem } : { made, expires };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export type TimeBasis = "made" | "expires" | "posted";
export type DatedReport = { post_at: number; made?: number | null; expires?: number | null };

/**
 * 한 제품의 글들에 "추정 제조 시각"을 매긴다 (같은 순서로 돌려줌).
 * shelfMonths: 두 날짜를 다 적은 글이 없을 때 쓸 유통기한 길이
 */
export function productionTimes(reports: DatedReport[], shelfMonths = FALLBACK_SHELF_MONTHS): { at: number; basis: TimeBasis }[] {
  const both = reports.filter((r) => r.made != null && r.expires != null).map((r) => r.expires! - r.made!);
  // 제품별 유통기한 길이는 방 기본값의 절반~두 배 안으로 (몇 글의 이상한 날짜가 다른 글의 추정을 크게 흔들지 않게, Sprint 29)
  const base = shelfMonths * 30.44 * DAY;
  const shelf = both.length ? Math.min(base * 2, Math.max(base / 2, median(both))) : base;
  const made = (r: DatedReport): number | null => (r.made != null ? r.made : r.expires != null ? r.expires - shelf : null);
  // 제조 → 글 간격: 날짜를 적은 글들로. 음수(미래 제조일 추정)는 0으로
  const lags = reports.flatMap((r) => {
    const m = made(r);
    return m === null ? [] : [Math.max(0, r.post_at - m)];
  });
  const lag = lags.length ? median(lags) : 0;
  // 제품은 글보다 먼저 만들어졌다 — 추정이 글 올린 시각보다 늦으면 글 시각으로 (먼 유통기한 하나로 "가장 새 라벨"이 되지 않게)
  return reports.map((r) =>
    r.made != null
      ? { at: Math.min(r.made, r.post_at), basis: "made" as const }
      : r.expires != null
        ? { at: Math.min(r.expires - shelf, r.post_at), basis: "expires" as const }
        : { at: r.post_at - lag, basis: "posted" as const },
  );
}

/** 글·제품 줄들(같은 글이 여러 줄이어도 됨) → "제품|글" 별 추정 제조 시각. 제품마다 따로 계산한다 */
export function productionTimeIndex(
  rows: { product_id: string; post_id: string; at?: number; made?: number | null; expires?: number | null; board?: string }[],
): Map<string, { at: number; basis: TimeBasis }> {
  const byProduct = new Map<string, Map<string, (typeof rows)[number]>>();
  for (const r of rows) {
    if (r.at === undefined) continue;
    const posts = byProduct.get(r.product_id) ?? new Map();
    if (!posts.has(r.post_id)) posts.set(r.post_id, r);
    byProduct.set(r.product_id, posts);
  }
  const out = new Map<string, { at: number; basis: TimeBasis }>();
  for (const [productId, posts] of byProduct) {
    const list = [...posts.values()];
    const board = list[0]?.board;
    const times = productionTimes(
      list.map((r) => ({ post_at: r.at!, made: r.made, expires: r.expires })),
      (board && DEFAULT_SHELF_MONTHS[board]) || FALLBACK_SHELF_MONTHS,
    );
    list.forEach((r, i) => out.set(`${productId}|${r.post_id}`, times[i]!));
  }
  return out;
}
