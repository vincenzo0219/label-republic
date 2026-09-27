import { z } from "zod";
import { PIN_PATTERN } from "./password";

const trimmed = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label}을(를) 입력해주세요.` })
    .trim()
    .min(min, `${label}은(는) ${min}자 이상이어야 합니다.`)
    .max(max, `${label}은(는) ${max}자 이하여야 합니다.`);

export const nickname = trimmed(2, 20, "닉네임");
export const pin = z.string().regex(PIN_PATTERN, "비밀번호는 숫자 4자리입니다.");
export const summaryLines = z.tuple([trimmed(2, 120, "요약"), trimmed(2, 120, "요약"), trimmed(2, 120, "요약")]);

export const sortSchema = z.enum(["trust", "latest", "votes"]).catch("trust");
export type SortKey = z.infer<typeof sortSchema>;

export const createPostSchema = z.object({
  category: z.string().min(1, "카테고리를 선택해주세요."),
  nickname,
  pw: pin,
  title: trimmed(2, 120, "제목"),
  body: trimmed(10, 20000, "본문"),
  /** 작성자가 검수한 최종 3줄 요약. 없으면 서버가 생성한다. */
  summary: summaryLines.optional(),
  /** /api/summary/preview 가 발급한 서명 토큰 — AI 원본과 비교해 is_author_edited 판정 */
  summaryToken: z.string().max(4000).optional(),
});

export const updatePostSchema = z.object({
  pw: pin,
  title: trimmed(2, 120, "제목").optional(),
  body: trimmed(10, 20000, "본문").optional(),
  summary: summaryLines.optional(),
  summaryToken: z.string().max(4000).optional(),
});

export const pinOnlySchema = z.object({ pw: pin });

export const voteSchema = z.object({ value: z.union([z.literal(1), z.literal(-1)]) });

export const reportSchema = z.object({ reason: z.string().trim().max(200).default("") });

export const commentSchema = z.object({
  nickname,
  pw: pin,
  body: trimmed(1, 1000, "댓글"),
});

export const summaryPreviewSchema = z.object({
  title: z.string().trim().max(120).default(""),
  body: trimmed(10, 20000, "본문"),
});

export const regenerateSummarySchema = z.object({
  pw: pin,
  /** 지정하면 작성자 수정본으로 저장, 없으면 AI로 재생성 */
  summary: summaryLines.optional(),
});

export const boardRequestSchema = z.object({
  name: trimmed(2, 40, "보드 이름"),
  description: z.string().trim().max(300).default(""),
});

export function firstIssue(err: z.ZodError): string {
  return err.issues[0]?.message ?? "입력값이 올바르지 않습니다.";
}
