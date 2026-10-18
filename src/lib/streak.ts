/**
 * 🔥 연속 기록 (Sprint 80). 오늘의 문제·오늘의 책 질문·토론 투표 중 하나라도 하면 그날이 이어진다.
 * 이 브라우저에만 저장하고, 알림을 켠 브라우저면 서버에도 "오늘 했음"을 알려 저녁 알림(끊기기 전)에 쓴다.
 */
import { streakOf } from "./daily";
import { getPushState } from "./watchlist";

const KEY = "lr:streakDays";
const kstDay = (d = new Date()) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
const DAILY_KEY = "lr:daily";

function readDays(): string[] {
  const days: string[] = [];
  try {
    const own = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as unknown;
    if (Array.isArray(own)) days.push(...own.filter((d): d is string => typeof d === "string"));
    // 오늘의 문제(Sprint 66)가 따로 남긴 날짜도 함께 센다
    const daily = JSON.parse(window.localStorage.getItem(DAILY_KEY) ?? "null") as { days?: unknown } | null;
    if (daily && Array.isArray(daily.days)) days.push(...daily.days.filter((d): d is string => typeof d === "string"));
  } catch {}
  return days;
}

export function currentStreak(today = kstDay()): number {
  return streakOf(readDays(), today);
}

/** 오늘 할 일을 했다고 기록하고 연속 일수를 돌려준다 */
export function markDailyAction(today = kstDay()): number {
  try {
    const own = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as string[];
    if (!own.includes(today)) window.localStorage.setItem(KEY, JSON.stringify([...own, today].slice(-400)));
  } catch {}
  const s = getPushState();
  if (s)
    void fetch("/api/push/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: s.endpoint, token: s.token }),
      keepalive: true,
    }).catch(() => {});
  return currentStreak(today);
}
