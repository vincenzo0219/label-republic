/**
 * 📈 코스피 맞히기 (10/29 대표님): 투자방 3곳 맨 위 게임. 종목 이름·사라/팔라 같은 말은 쓰지 않는다 (시장 전체를 맞히는 놀이).
 * - 거래일(월~금)마다 "오늘 코스피 종가가 어제 종가보다" 📈/📉 하나. 그날 오전 9시(KST)에 마감, 그 뒤에는 다음 거래일 문제
 * - 결과는 바로 앞에 넣은 종가와 비교. 같으면(보합) 이긴 것도 진 것도 아니다. 종가가 안 들어온 날(휴장)은 "결과 대기"로 남는다
 * - 성적은 "7승 3패" (퍼센트 X), 🔥 연속은 3번부터
 * - 다른 사람 닉네임 옆에는 아무 배지도 없다. 내 성적은 내 카드에서만, 🏆 순위는 닉네임과 맞힌 수만
 */

export const KOSPI_ROOMS = new Set(["주식", "미국주식방", "적립식-투자방"]);

/** 🔥 연속 표시는 이만큼부터 */
export const STREAK_SHOW = 3;
/** 🏆 이번 달 순위: 이만큼 이상 결과 난 사람만, 위에서 몇 명 */
export const RANK_MIN_GAMES = 5;
export const RANK_TOP = 5;

const DAY_MS = 86_400_000;
const KST_MS = 9 * 3600_000;

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dow = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
export const isWeekday = (day: string) => dow(day) >= 1 && dow(day) <= 5;

/** 이 날 다음 평일 */
export function nextWeekday(day: string): string {
  let ms = Date.parse(`${day}T00:00:00Z`) + DAY_MS;
  while (!isWeekday(ymd(ms))) ms += DAY_MS;
  return ymd(ms);
}

/** 지금 고를 수 있는 문제의 날짜: 평일 9시 전이면 오늘, 아니면 다음 평일 */
export function questionDay(now = new Date()): string {
  const k = now.getTime() + KST_MS;
  const day = ymd(k);
  const hour = new Date(k).getUTCHours();
  return isWeekday(day) && hour < 9 ? day : nextWeekday(day);
}

/** 그 날 오전 9시(KST) = 마감 */
export const lockAt = (day: string) => `${day}T00:00:00.000Z`;

export type Game = { day: string; ok: boolean };

/** 결과 난 판들(최근 것부터)로 성적 (순수 함수, 저장소 SQL 과 같은 규칙) */
export function statsOf(recentFirst: readonly boolean[]): { wins: number; losses: number; streak: number } {
  const wins = recentFirst.filter(Boolean).length;
  const firstMiss = recentFirst.indexOf(false);
  return { wins, losses: recentFirst.length - wins, streak: firstMiss < 0 ? recentFirst.length : firstMiss };
}

/** 🎯 맞힌 수 - 틀린 수 (보합 빼고). 1 이상일 때만 값이 있다. 화면에는 쓰지 않는다 (나중에 본인이 켜는 표시용, 10/29) */
export function kospiBadge(wins: number, losses: number): { label: string; title: string } | null {
  const n = wins - losses;
  return n >= 1 ? { label: `🎯+${n}`, title: `코스피 맞히기 ${wins}승 ${losses}패` } : null;
}

/** 종가 두 개로 결과: 1 올랐다, -1 내렸다, 0 보합 */
export const moveOf = (prev: number, close: number): 1 | -1 | 0 => (close > prev ? 1 : close < prev ? -1 : 0);

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
/** "10/30(금)" */
export const dayLabel = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}(${WEEK[dow(day)]})`;
