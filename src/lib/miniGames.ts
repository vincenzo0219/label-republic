/**
 * 🎮 방 미니게임 (10/29 대표님 "1번 2번 3번 진행해. 테니스 랠리 탭도 진행해"). 방 "1분 테스트" 버튼 옆 버튼 하나로만 들어간다 (새 탭 X).
 * 서버·브라우저·테스트 공용 순수 함수.
 */
export type GameId = "reaction" | "worldcup" | "latte" | "rally";

export type GameDef = {
  id: GameId;
  room: string;
  roomName: string;
  emoji: string;
  name: string;
  /** 점수가 낮을수록 좋은가 (반응속도) */
  lowerBetter: boolean;
  /** 서버가 받는 점수 범위 (지어낸 기록 막기) */
  min: number;
  max: number;
  /** 순위·최고 기록이 없는 게임 (월드컵) */
  noRecord?: boolean;
};

export const GAMES: Record<GameId, GameDef> = {
  reaction: { id: "reaction", room: "게임-덕후방", roomName: "게임 덕후방", emoji: "⚡", name: "반응속도 결투", lowerBetter: true, min: 80, max: 2000 },
  worldcup: { id: "worldcup", room: "미혼남녀-만남-행사", roomName: "미혼남녀 만남 행사", emoji: "💘", name: "이상형 월드컵", lowerBetter: false, min: 0, max: 15, noRecord: true },
  latte: { id: "latte", room: "커피-덕후방", roomName: "커피 덕후방", emoji: "☕", name: "라떼아트 따르기", lowerBetter: false, min: 0, max: 500 },
  rally: { id: "rally", room: "테니스-덕후방", roomName: "테니스 덕후방", emoji: "🎾", name: "랠리 탭", lowerBetter: false, min: 0, max: 300 },
};

export const isGameId = (s: string): s is GameId => Object.prototype.hasOwnProperty.call(GAMES, s);

/** 방 버튼 (방 화면 "1분 테스트" 옆) */
export function roomGameLink(slug: string): { href: string; label: string } | null {
  const g = Object.values(GAMES).find((x) => x.room === slug);
  return g ? { href: `/games/${g.id}?from=room`, label: `${g.emoji} ${g.name}` } : null;
}

/** 점수가 정수이고 범위 안인지 */
export function validScore(game: GameId, score: unknown): score is number {
  const g = GAMES[game];
  return typeof score === "number" && Number.isInteger(score) && score >= g.min && score <= g.max;
}

export const better = (game: GameId, a: number, b: number | null): boolean => b === null || (GAMES[game].lowerBetter ? a < b : a > b);

export function formatScore(game: GameId, score: number): string {
  if (game === "reaction") return `${(score / 1000).toFixed(3)}초`;
  if (game === "latte") return `${score}점`;
  if (game === "rally") return `${score}번`;
  return WORLDCUP_TRAITS[score] ?? "";
}

export function shareText(game: GameId, score: number): string {
  if (game === "worldcup") return `💘 나의 이상형: ${WORLDCUP_TRAITS[score]}. 너는?`;
  if (game === "reaction") return `⚡ 반응속도 ${formatScore(game, score)}, 이길 수 있어?`;
  if (game === "latte") return `☕ 라떼아트 ${formatScore(game, score)}, 이길 수 있어?`;
  return `🎾 랠리 ${formatScore(game, score)} 이어 받기, 이길 수 있어?`;
}

/** 💘 이상형 월드컵 16장: 실제 사람·사진 없이 따뜻한 성격·습관만 */
export const WORLDCUP_TRAITS: readonly string[] = [
  "💬 답장 빠른 사람",
  "🗺️ 데이트 코스 짜 오는 사람",
  "🍳 요리 잘하는 사람",
  "🏃 운동 같이 하는 사람",
  "😂 나를 자주 웃게 하는 사람",
  "👂 내 얘기 끝까지 들어 주는 사람",
  "⏰ 약속 시간 잘 지키는 사람",
  "📚 책·영화 취향 맞는 사람",
  "🐶 동물 좋아하는 사람",
  "✈️ 여행 같이 다니는 사람",
  "🙏 고맙다·미안하다 잘 하는 사람",
  "🌱 꾸준히 자기 일 하는 사람",
  "🎁 작은 것도 챙기는 사람",
  "🧘 화 잘 안 내는 사람",
  "🏠 집에서 같이 쉬는 게 좋은 사람",
  "👨‍👩‍👧 가족 아끼는 사람",
];

/** ☕ 라떼 한 잔 점수: 목표 띠 안이면 70~100, 벗어나면 줄고, 넘치면 0 */
export const LATTE_CUPS = 5;
export const LATTE_HALF = 5;
export function latteCupScore(fill: number, center: number): number {
  if (fill >= 100) return 0;
  const d = Math.abs(fill - center);
  if (d <= LATTE_HALF) return Math.round(100 - d * 6);
  return Math.max(0, Math.round(60 - (d - LATTE_HALF) * 6));
}
export const latteHeart = (fill: number, center: number) => fill < 100 && Math.abs(fill - center) <= LATTE_HALF;

/** ⚡ 한 판 = 5번 */
export const REACTION_TRIES = 5;
