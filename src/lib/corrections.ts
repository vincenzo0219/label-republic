/**
 * 정정 제안 공용 규칙 (서버·클라이언트).
 *
 * 방장이 판정하지 않는다. 동의·반대 가중치로 "동의된 제안"을 자동으로 정하고, 그 효과도 자동 규칙이다.
 */

/** 동의 가중치 합이 이 이상이고 */
export const SUPPORT_MIN_SCORE = 3;
/** 반대 가중치의 이 배수 이상이면 "동의된 정정 제안" */
export const SUPPORT_RATIO = 2;
/** 고유 신고 이만큼이면 제안을 가린다 (글 자동 블라인드와 같은 기준) */
export const CORRECTION_HIDE_REPORTS = 5;
/** 한 사람이 한 글에 동시에 열어 둘 수 있는 제안 수 */
export const MAX_OPEN_PER_AUTHOR = 3;
/** 한 글에 열려 있을 수 있는 제안 수 */
export const MAX_OPEN_PER_POST = 30;

export type CorrectionTarget = "fact" | "text" | "other";
export type CorrectionStatus = "open" | "applied" | "answered" | "withdrawn";

export const TARGET_LABEL: Record<CorrectionTarget, string> = { fact: "수치", text: "본문 문장", other: "그 밖의 부분" };
export const STATUS_LABEL: Record<CorrectionStatus, string> = {
  open: "검토 중",
  applied: "작성자 반영",
  answered: "작성자 답변",
  withdrawn: "철회됨",
};

export function isSupported(agreeScore: number, disagreeScore: number): boolean {
  return agreeScore >= SUPPORT_MIN_SCORE && agreeScore >= disagreeScore * SUPPORT_RATIO;
}

/** 인용이 본문에 있는지 비교할 때: 공백을 하나로, 앞뒤 공백 제거 */
export function squash(s: string): string {
  return s.normalize("NFKC").replace(/\s+/g, " ").trim();
}
