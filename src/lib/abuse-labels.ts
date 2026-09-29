/** AI 자동 운영이 가리는 이유 (화면·서버 공용 — 클라이언트 번들에 AI SDK 가 딸려 가지 않게 따로 둔다) */
export const ABUSE_LABELS = {
  profanity: "욕설",
  hate: "혐오·비하 표현",
  harassment: "인신공격·위협",
  personal_info: "개인정보 노출",
} as const;
export type AbuseCategory = keyof typeof ABUSE_LABELS;

export function abuseLabel(reason: string | null | undefined): string {
  return (reason && (ABUSE_LABELS as Record<string, string>)[reason]) || "운영 원칙 위반";
}
