/**
 * ✍️ 오늘 몇 자 썼다 인증 (10/24, 작가지망생방). 하루(KST) 한 번, 같은 닉네임이면 같은 사람.
 * 다시 보내면 그날 기록을 고친다. 연속 일수와 이번 주(월~일, KST) 합계 순위를 보여 준다.
 */
export const WRITING_ROOMS: ReadonlySet<string> = new Set(["작가지망생방"]);
export const MAX_CHARS = 100_000;
export const NOTE_MAX = 60;

const DAY = 86_400_000;
/** KST 날짜 (YYYY-MM-DD) */
export const kstDay = (d = new Date()) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** 그 주 월요일 (KST 날짜 기준) */
export function weekStart(day: string): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = 일
  return addDays(day, -((dow + 6) % 7));
}
export const weekEnd = (day: string) => addDays(weekStart(day), 6);

/** day 에 끝나는 연속 일수 (day 에 기록이 없으면 0) */
export function streakAt(days: readonly string[], day: string): number {
  const set = new Set(days);
  let n = 0;
  for (let d = day; set.has(d); d = addDays(d, -1)) n++;
  return n;
}

export type WeeklyRow = { author_key: string; nickname: string; chars: number; day: string; at: string };
export type WeeklyTop = { author_key: string; nickname: string; chars: number };

/** 그 주(월~일) 합계 상위 n명. 동점이면 먼저 인증한 사람, 닉네임은 가장 최근 것 */
export function weeklyTop(rows: readonly WeeklyRow[], today: string, n = 5): WeeklyTop[] {
  const from = weekStart(today);
  const to = weekEnd(today);
  const m = new Map<string, WeeklyTop & { first: string; last: string }>();
  for (const r of rows) {
    if (r.day < from || r.day > to) continue;
    const cur = m.get(r.author_key);
    if (!cur) {
      m.set(r.author_key, { author_key: r.author_key, nickname: r.nickname, chars: r.chars, first: r.at, last: r.day });
      continue;
    }
    cur.chars += r.chars;
    if (r.at < cur.first) cur.first = r.at;
    if (r.day >= cur.last) {
      cur.last = r.day;
      cur.nickname = r.nickname;
    }
  }
  return [...m.values()]
    .sort((a, b) => b.chars - a.chars || a.first.localeCompare(b.first))
    .slice(0, n)
    .map(({ author_key, nickname, chars }) => ({ author_key, nickname, chars }));
}

export const fmtChars = (n: number) => n.toLocaleString("en-US");

/** 수다방에 올라가는 한 줄 */
export const writingLine = (chars: number, streak: number, note?: string) =>
  `✍️ 오늘 ${fmtChars(chars)}자 · 연속 ${streak}일째${note ? ` · ${note}` : ""}`;
