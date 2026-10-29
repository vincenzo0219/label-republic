/**
 * 🔔 테니스방 알림 (10/29 대표님 "1번과 2번 진행해"): 날짜 계산·맞춤·문구 (DB 없이 쓰는 부분).
 * 1) 우리 동네 새 게임 알림  2) 공공 코트 예약 오픈 알림
 */
import { addDays, areaMatches, kstHm, kstYmd } from "./instructorRoom";
import { GAMES_TAB, TENNIS_ROOM, type GameType } from "./tennisGames";

export const TENNIS_ALERT_MAX_AREAS = 5;
/** 한 구독에 15분에 한 번, 하루 10번까지 (그 사이 게임은 모였다가 다음에) */
export const TENNIS_GAP_MS = 15 * 60_000;
export const TENNIS_DAILY_MAX = 10;
/** 코트 오픈: 전날 저녁 알림 시각, 시각을 모를 때 당일 알림 시각 (KST) */
export const EVE_HM = "20:00";
export const DEFAULT_OPEN_HM = "09:00";

const ROOM_PATH = `/c/${encodeURIComponent(TENNIS_ROOM)}`;
export const gamesPath = (gameId?: string) => `${ROOM_PATH}?tab=${GAMES_TAB}${gameId ? `#game-${gameId}` : ""}`;

export type GameAlertLine = { id: string; sido: string; sigungu: string; court: string; play_date: string; start_time: string; game_type: GameType };

export const matchesTennisSub = (g: GameAlertLine, s: { areas: string[]; types: string[] }) =>
  s.areas.some((a) => areaMatches(a, g.sido, g.sigungu)) && (s.types.length === 0 || s.types.includes(g.game_type));

const md = (ymd: string) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;
const place = (g: GameAlertLine) => g.sigungu || g.sido;

export function tennisGameMessage(items: GameAlertLine[]): { title: string; body: string; url: string; tag: string } {
  const one = items.length === 1 ? items[0]! : null;
  if (one)
    return {
      title: `🎾 새 게임 · ${place(one)}`,
      body: `${md(one.play_date)} ${one.start_time} · ${one.court} · ${one.game_type}`,
      url: `${gamesPath(one.id)}`,
      tag: `lr-tennis-${one.id}`,
    };
  return {
    title: `🎾 우리 동네 새 게임 ${items.length}건`,
    body: items.slice(0, 2).map((g) => `${place(g)} ${md(g.play_date)} ${g.game_type}`).join(" / "),
    url: gamesPath(),
    tag: "lr-tennis",
  };
}

// ---------------------------------------------------------------------------
// 코트 예약 오픈 날짜
// ---------------------------------------------------------------------------
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** from(YYYY-MM-DD, 그날 포함)부터 가장 가까운 오픈일. 그 달에 없는 날(31일 등)은 그달 건너뛴다 */
export function nextOpenDay(openDays: number[], from: string): string | null {
  const days = [...new Set(openDays.filter((d) => Number.isInteger(d) && d >= 1 && d <= 31))].sort((a, b) => a - b);
  if (!days.length) return null;
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const d0 = Number(from.slice(8, 10));
  for (let i = 0; i < 24; i++) {
    const last = daysInMonth(y, m);
    const pick = days.find((d) => d <= last && (i > 0 || d >= d0));
    if (pick) return `${y}-${String(m).padStart(2, "0")}-${String(pick).padStart(2, "0")}`;
    m++;
    if (m > 12) (m = 1), y++;
  }
  return null;
}

export type CourtOpen = { id: number; court: string; sido: string; sigungu: string; open_days: number[]; open_time: string; booking_url: string; source_url: string; note: string; last_verified: string; active: boolean };

/**
 * 지금 보낼 알림: 오늘이 오픈일이고 여는 시각(모르면 09:00)이 지났으면 "day",
 * 내일이 오픈일이고 20:00이 지났으면 "eve". 둘 다 아니면 null
 */
export function courtOpenDue(c: Pick<CourtOpen, "open_days" | "open_time">, now: Date): { kind: "day" | "eve"; openDay: string } | null {
  const today = kstYmd(now);
  const hm = kstHm(now);
  if (nextOpenDay(c.open_days, today) === today && hm >= (c.open_time || DEFAULT_OPEN_HM) && hm < "22:00") return { kind: "day", openDay: today };
  const tomorrow = addDays(today, 1);
  if (nextOpenDay(c.open_days, tomorrow) === tomorrow && hm >= EVE_HM && hm < "22:00") return { kind: "eve", openDay: tomorrow };
  return null;
}

export function courtOpenMessage(c: Pick<CourtOpen, "id" | "court" | "open_time" | "booking_url">, kind: "day" | "eve", openDay: string) {
  const when = c.open_time ? ` ${c.open_time}` : "";
  return kind === "eve"
    ? { title: `🔔 내일(${md(openDay)}) ${c.court} 예약 오픈`, body: `내일${when} 예약이 열려요. 공지를 한 번 더 확인하세요`, url: c.booking_url, tag: `lr-court-${c.id}-${openDay}` }
    : { title: `🎾 오늘 ${c.court} 예약 오픈`, body: `오늘${when} 예약이 열려요. 지금 확인해 보세요`, url: c.booking_url, tag: `lr-court-${c.id}-${openDay}` };
}

/** 카드에 보일 "매달 10·25일" + 다음 오픈 D-day */
export function openRuleLabel(c: Pick<CourtOpen, "open_days" | "open_time">, now = new Date()): string {
  const days = [...c.open_days].sort((a, b) => a - b).join("·");
  const next = nextOpenDay(c.open_days, kstYmd(now));
  const dd = next ? Math.round((Date.parse(`${next}T00:00:00Z`) - Date.parse(`${kstYmd(now)}T00:00:00Z`)) / 86_400_000) : null;
  return `매달 ${days}일${c.open_time ? ` ${c.open_time}` : ""}${next ? ` · 다음 ${md(next)} (${dd === 0 ? "오늘" : `D-${dd}`})` : ""}`;
}
