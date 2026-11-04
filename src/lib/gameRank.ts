/**
 * 🏆 전국 랭킹 · 🏁 지난 기록 도전 (11/4 대표님 "지난기록 도전으로 가자. 전국 랭킹").
 * 실시간 대결은 같은 시간에 사람이 없어 성사되지 않았다(7일 0판). 그래서 다른 사람이 남긴 진짜 기록을 목표로 친다.
 * 서버·브라우저·테스트 공용 순수 함수.
 */
import type { GameId } from "./miniGames";

/** 랭킹이 있는 게임 (월드컵은 기록이 아니라 취향이라 뺀다) */
export const RANK_GAMES = ["booksent", "anichosung", "kmatch", "pk", "reaction", "latte", "rally"] as const satisfies readonly GameId[];
export type RankGame = (typeof RANK_GAMES)[number];
export const isRankGame = (s: string): s is RankGame => (RANK_GAMES as readonly string[]).includes(s);

export const RANK_PERIODS = ["today", "week", "all"] as const;
export type RankPeriod = (typeof RANK_PERIODS)[number];
export const PERIOD_LABEL: Record<RankPeriod, string> = { today: "오늘", week: "이번 주", all: "전체" };
export const isRankPeriod = (s: string | null | undefined): s is RankPeriod => !!s && (RANK_PERIODS as readonly string[]).includes(s);

/** 닉네임이 없으면 짧은 해시로 "익명 덕후 #a1b2" (해시 앞 4자는 사람을 알아볼 수 없다) */
export const rankName = (nickname: string | null | undefined, visitorHash: string): string => nickname?.trim() || `익명 덕후 #${visitorHash.slice(0, 4)}`;

/** 공동 순위: 같은 기록이면 같은 순위 (1, 2, 2, 4) */
export function competitionRanks(scores: readonly number[], lowerBetter: boolean): number[] {
  return scores.map((s) => 1 + scores.filter((o) => (lowerBetter ? o < s : o > s)).length);
}

/** 상위 몇 % (1위 혼자면 상위 1%, 꼴찌면 100%) */
export const topPercent = (rank: number, total: number): number => (total <= 0 ? 100 : Math.max(1, Math.round((rank / total) * 100)));

/**
 * 🏁 도전할 기록 고르기: 다른 사람들의 최고 기록(나는 빼고) 중
 * - 내 최고가 있으면 내 기록보다 "한 칸 위" (조금만 더 하면 넘을 기록). 내가 이미 1등이라 넘을 기록이 없으면 null
 * - 처음이면 가운데(중앙값) 기록
 */
export function pickTarget<T extends { score: number }>(others: readonly T[], myBest: number | null, lowerBetter: boolean): T | null {
  if (!others.length) return null;
  const sorted = [...others].sort((a, b) => (lowerBetter ? a.score - b.score : b.score - a.score)); // 좋은 기록 먼저
  if (myBest === null) return sorted[Math.floor((sorted.length - 1) / 2)]!;
  const above = sorted.filter((o) => (lowerBetter ? o.score < myBest : o.score > myBest));
  return above.length ? above[above.length - 1]! : null;
}

/** 이번 판이 목표 기록을 넘었나 (같으면 못 넘은 것) */
export const beatsTarget = (score: number, target: number, lowerBetter: boolean): boolean => (lowerBetter ? score < target : score > target);
