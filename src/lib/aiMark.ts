/**
 * 카드에 작게 붙이는 회색 🤖 (10/25 대표님 "노방장 + 작은 회색 🤖 으로 전부 바꿔").
 * AI 큐레이터 글과 운영 자동화 닉네임(노방장·돈키호테·덕후1호)으로 올라간 정보·행사·퀴즈 글은 AI가 쓴 글이다.
 */
/**
 * AI·자동화가 쓰는 카드 글의 작성자 이름 (10/26 대표님 "전부 카드글 작성자 ai는 노방장으로 통일해줘").
 * 큐레이터 글·방마다 오늘의 질문·책 질문·운영 초안 글이 모두 이 이름으로 올라간다. (비즈파일럿·숨긴 AI 토론방은 따로)
 */
export const AI_AUTHOR = "노방장";

/** 예전 운영·AI 글 작성자 이름 — 지난 댓글에 남아 있어서 🤖·운영 표시 판단에는 계속 넣어 둔다 */
export const LEGACY_AI_AUTHORS = ["돈키호테", "덕후1호", "AI 큐레이터"] as const;

export const AI_OPS_NICKS = new Set<string>([AI_AUTHOR, ...LEGACY_AI_AUTHORS]);

/** 카드 글 작성자 이름 정리: 예전 운영·AI 이름(또는 빈 이름)이면 노방장으로 */
export function cardAuthor(nickname: string | null | undefined): string {
  const n = nickname?.trim() ?? "";
  return !n || (LEGACY_AI_AUTHORS as readonly string[]).includes(n) ? AI_AUTHOR : n;
}

export function isAiCard(p: { is_ai_curated: boolean; nickname: string }): boolean {
  return p.is_ai_curated || AI_OPS_NICKS.has(p.nickname);
}
