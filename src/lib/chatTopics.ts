/** 오늘의 수다 (Sprint 85) — 전체 수다방 맨 위 한 줄. 날짜로 돌아가며, 답하기 쉬운 가벼운 질문만. */
export const LOUNGE_SLUG = "전체";
const START = "2026-10-19";

export const CHAT_TOPICS = [
  "요즘 빠져 있는 거 하나만",
  "오늘 점심 뭐 먹었어요?",
  "지금 듣는 노래는?",
  "주말에 뭐 할 거예요?",
  "최근에 산 것 중 제일 잘 산 것",
  "요즘 읽거나 보는 거 있어요?",
  "출근길·등굣길에 하는 일",
  "오늘 기분 한 단어로",
  "돈 아깝지 않았던 취미 지출",
  "요즘 자주 가는 곳",
  "아침형? 저녁형?",
  "최근에 웃었던 일",
  "가을 하면 떠오르는 것",
  "잠들기 전에 하는 일",
  "다시 시작하고 싶은 취미",
];

export function chatTopic(day: string): string {
  const n = Math.round((Date.parse(day) - Date.parse(START)) / 86_400_000);
  const len = CHAT_TOPICS.length;
  return CHAT_TOPICS[((n % len) + len) % len]!;
}
