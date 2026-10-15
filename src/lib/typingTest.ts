/**
 * ⌨️ 한글 타자 테스트 (Sprint 67) — 짧은 문장 5개를 치고 타수(1분에 누른 자판 수)와 정확도를 잰다.
 * 조용한 키보드 방으로 사람을 데려오는 입구: 결과 화면에서 "타수 + 키보드·축"을 키보드 방 인증 글에 남긴다.
 * 문장은 노방장이 직접 쓴 것(마지막 하나는 오래전부터 쓰이는 연습 문장)이라 저작권 문제가 없다.
 */
export const TYPING_SENTENCES: readonly string[] = [
  "오늘도 키보드 소리와 함께 하루를 시작합니다.",
  "적축은 부드럽고 갈축은 걸리는 맛이 있다고들 해요.",
  "가을 하늘이 높고 바람이 시원해서 산책하기 좋은 날이다.",
  "빠르게 치는 것보다 정확하게 치는 것이 먼저입니다.",
  "책상 위에 커피 한 잔과 좋아하는 음악이면 충분하다.",
  "윤활을 마친 스위치는 소리가 한결 조용하고 매끄러워졌다.",
  "늦은 밤 창밖으로 빗소리가 조용히 들려왔다.",
  "새 키캡을 끼우니 오래된 키보드도 새것처럼 보인다.",
  "작은 습관 하나가 하루를 바꾸고 일 년을 바꾼다.",
  "다람쥐 헌 쳇바퀴에 타고파.",
];

/** 한 번에 치는 문장 수 */
export const TYPING_ROUNDS = 5;

export const TYPING_MIN_PARTICIPANTS = 20;

/** 결과 화면의 인증 칸이 댓글을 다는 글 — 키보드 방의 덕후1호 인증 모음 글 */
export const TYPING_BRAG_POST_ID = "1456";

/** 서버가 받는 타수 상한 (사람이 낼 수 있는 기록을 한참 넘는 값은 버린다) */
export const TYPING_MAX_CPM = 1500;

// 겹받침·겹모음은 자판을 두 번 누른다 (쌍자음·ㅐ·ㅔ·ㅒ·ㅖ는 시프트 포함 한 번으로 센다)
const DOUBLE_VOWELS = new Set([9, 10, 11, 14, 15, 16, 19]); // ㅘ ㅙ ㅚ ㅝ ㅞ ㅟ ㅢ
const DOUBLE_FINALS = new Set([3, 5, 6, 9, 10, 11, 12, 13, 14, 15, 18]); // ㄳ ㄵ ㄶ ㄺ ㄻ ㄼ ㄽ ㄾ ㄿ ㅀ ㅄ

/** 한 글자를 치려면 자판을 몇 번 누르는지 (두벌식 기준, 시프트는 세지 않음) */
export function keystrokes(ch: string): number {
  const c = ch.codePointAt(0)!;
  if (c < 0xac00 || c > 0xd7a3) return 1;
  const i = c - 0xac00;
  const jung = Math.floor((i % 588) / 28);
  const jong = i % 28;
  return 1 + (DOUBLE_VOWELS.has(jung) ? 2 : 1) + (jong === 0 ? 0 : DOUBLE_FINALS.has(jong) ? 2 : 1);
}

/** 목표 문장과 친 문장을 글자 단위로 맞춰 본다 — 맞게 친 글자의 타수와, 목표 글자 중 맞은 비율 */
export function scoreLine(target: string, typed: string): { strokes: number; correct: number; total: number } {
  const t = [...target];
  const y = [...typed];
  let strokes = 0;
  let correct = 0;
  for (let i = 0; i < t.length; i++) {
    if (y[i] === t[i]) {
      correct++;
      strokes += keystrokes(t[i]!);
    }
  }
  // 목표보다 길게 친 글자는 틀린 글자로 센다
  return { strokes, correct, total: Math.max(t.length, y.length) };
}

/** 타수(1분당 맞게 누른 자판 수). ms 가 너무 짧으면 0 */
export function cpm(strokes: number, ms: number): number {
  if (ms < 1000) return 0;
  return Math.min(TYPING_MAX_CPM, Math.round((strokes * 60_000) / ms));
}

export type TypingTier = { emoji: string; name: string; line: string };

export function typingTier(speed: number): TypingTier {
  if (speed >= 700) return { emoji: "🏆", name: "타자왕", line: "한컴 타자연습 시절 반에서 1등 하던 손이에요" };
  if (speed >= 500) return { emoji: "🔥", name: "키보드 덕후", line: "생각하는 속도로 치는 손이에요" };
  if (speed >= 350) return { emoji: "⚡", name: "빠른 손", line: "일할 때 누구보다 빨리 끝내는 속도예요" };
  if (speed >= 200) return { emoji: "⌨️", name: "보통 타자", line: "대부분의 사람이 이 구간이에요" };
  return { emoji: "🐢", name: "독수리 타법", line: "정확하게 치는 게 먼저예요 — 속도는 따라와요" };
}

export type TypingDevice = "pc" | "mobile";

/** 인증 댓글 첫 줄 (QuickBrag 가 뒤에 "키보드·축"을 붙인다) */
export function typingBragLine(speed: number, accuracy: number, device: TypingDevice): string | null {
  if (!Number.isInteger(speed) || speed < 0 || speed > TYPING_MAX_CPM || !Number.isInteger(accuracy) || accuracy < 0 || accuracy > 100) return null;
  const t = typingTier(speed);
  return `⌨️ 한글 타자 테스트 ${speed}타 · 정확도 ${accuracy}%${device === "mobile" ? " (휴대폰)" : ""} (${t.emoji} ${t.name}) / 키보드·축: `;
}

export type TypingStats = {
  /** 같은 기기 종류(PC/휴대폰)의 첫 응시 참가자 */
  participants: number;
  topPercent: number | null;
  average: number | null;
  averageAccuracy: number | null;
};
