/**
 * 카드에 작게 붙이는 회색 🤖 (10/25 대표님 "노방장 + 작은 회색 🤖 으로 전부 바꿔").
 * AI 큐레이터 글과 운영 자동화 닉네임(노방장·돈키호테·덕후1호)으로 올라간 정보·행사·퀴즈 글은 AI가 쓴 글이다.
 */
export const AI_OPS_NICKS = new Set(["노방장", "돈키호테", "덕후1호", "AI 큐레이터"]);

export function isAiCard(p: { is_ai_curated: boolean; nickname: string }): boolean {
  return p.is_ai_curated || AI_OPS_NICKS.has(p.nickname);
}
