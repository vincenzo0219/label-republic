/**
 * 💰 이번 달 적립 완료 (10/24, 적립식 투자방). KST 달력으로 한 달에 한 번, 같은 닉네임이면 같은 사람.
 * 금액은 구간만(선택), 계좌·정확한 금액은 받지 않는다. 같은 달에 다시 보내면 그달 기록을 고친다.
 */
import { SAVINGS_ROOM } from "./investRooms";

export const SAVINGS_ROOMS: ReadonlySet<string> = new Set([SAVINGS_ROOM]);
export const SAVINGS_NOTE_MAX = 40;

export const BUCKETS = [
  { key: "lt10", label: "~10만" },
  { key: "10to30", label: "10~30만" },
  { key: "30to50", label: "30~50만" },
  { key: "50plus", label: "50만+" },
] as const;
export type Bucket = (typeof BUCKETS)[number]["key"];
export const isBucket = (v: unknown): v is Bucket => typeof v === "string" && BUCKETS.some((b) => b.key === v);

/** KST 달의 첫날 (YYYY-MM-01) */
export const kstMonth = (d = new Date()) => `${new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 7)}-01`;

/** month(YYYY-MM-01)에서 n달 뒤 (음수면 앞) */
export function addMonths(month: string, n: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, "0")}-01`;
}

/** month 에 끝나는 연속 개월 수 (그달 기록이 없으면 0) */
export function monthStreakAt(months: readonly string[], month: string): number {
  const set = new Set(months.map((m) => `${m.slice(0, 7)}-01`));
  let n = 0;
  for (let m = month; set.has(m); m = addMonths(m, -1)) n++;
  return n;
}

/** 수다방에 올라가는 한 줄 */
export const savingsLine = (streak: number, note?: string | null) => `💰 이번 달 적립 완료 · 연속 ${streak}개월${note ? ` · ${note}` : ""}`;

/** 적립일 알림: 1~28일 (모든 달에 있는 날만) */
export const isReminderDay = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 28;
