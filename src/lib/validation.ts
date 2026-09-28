import { z } from "zod";
import { PIN_PATTERN } from "./password";

const trimmed = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label}을(를) 입력해주세요.` })
    .trim()
    .min(min, `${label}은(는) ${min}자 이상이어야 합니다.`)
    .max(max, `${label}은(는) ${max}자 이하여야 합니다.`);

/**
 * 운영 주체나 AI 큐레이터로 오인될 수 있는 닉네임은 사람이 쓸 수 없다 (🤖 배지 없는 "AI 큐레이터" 사칭 방지).
 * 공백·기호·대소문자·전각 문자를 정규화한 뒤 검사한다.
 */
const RESERVED_CONTAINS = ["큐레이터", "운영자", "관리자", "운영팀", "라벨공화국", "노방장", "방장"];
const RESERVED_EXACT = ["admin", "administrator", "moderator", "mod", "system", "ai", "bot", "labelrepublic"];

export function isReservedNickname(name: string): boolean {
  const n = name.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
  return RESERVED_CONTAINS.some((w) => n.includes(w)) || RESERVED_EXACT.includes(n) || /^ai(bot|curator|큐)/.test(n);
}

export const nickname = trimmed(2, 20, "닉네임").refine((n) => !isReservedNickname(n), "운영자·AI 큐레이터로 오인될 수 있는 닉네임은 쓸 수 없어요.");
export const pin = z.string().regex(PIN_PATTERN, "비밀번호는 숫자 4자리입니다.");
export const summaryLines = z.tuple([trimmed(2, 120, "요약"), trimmed(2, 120, "요약"), trimmed(2, 120, "요약")]);

export const sortSchema = z.enum(["trust", "latest", "votes"]).catch("trust");
export type SortKey = z.infer<typeof sortSchema>;

export const postTypeSchema = z.enum(["info", "chat", "meetup"], { error: "글 유형([정보]/[잡담]/[정모])을 선택해주세요." });
export const postTypeFilterSchema = z.enum(["info", "chat", "meetup"]).optional().catch(undefined);

export const meetupSchema = z.object({
  meetAt: z.string().min(1, "정모 일시를 입력해주세요."),
  location: trimmed(2, 100, "장소"),
  minParticipants: z.coerce.number().int().min(2, "확정 인원은 2명 이상입니다.").max(50, "확정 인원은 50명 이하입니다."),
  capacity: z.coerce.number().int().min(2, "정원은 2명 이상입니다.").max(200, "정원은 200명 이하입니다."),
});

export const rsvpSchema = z.object({ nickname });

/** 첨부 이미지 참조 — 새 업로드는 token 필수, 수정 시 이미 붙어 있던 이미지는 token 없이 유지 */
export const imageRefsSchema = z
  .array(
    z.object({
      id: z.string().uuid("이미지 정보가 올바르지 않습니다."),
      token: z.string().max(64).optional(),
      alt: z.string().trim().max(200, "이미지 설명은 200자까지 쓸 수 있습니다.").default(""),
    }),
  )
  .max(6, "이미지는 글당 6장까지 첨부할 수 있습니다.");

export const createPostSchema = z.object({
  category: z.string().min(1, "카테고리를 선택해주세요."),
  /** 기획안: 글 작성 시 [정보]/[잡담] 태그 필수 선택 (+ 정모 제안) */
  postType: postTypeSchema,
  meetup: meetupSchema.optional(),
  nickname,
  pw: pin,
  title: trimmed(2, 120, "제목"),
  body: trimmed(10, 20000, "본문"),
  /** 작성자가 검수한 최종 3줄 요약. 없으면 서버가 생성한다. */
  summary: summaryLines.optional(),
  /** /api/summary/preview 가 발급한 서명 토큰 — AI 원본과 비교해 is_author_edited 판정 */
  summaryToken: z.string().max(4000).optional(),
  images: imageRefsSchema.optional(),
});

export const updatePostSchema = z.object({
  pw: pin,
  title: trimmed(2, 120, "제목").optional(),
  body: trimmed(10, 20000, "본문").optional(),
  summary: summaryLines.optional(),
  summaryToken: z.string().max(4000).optional(),
  images: imageRefsSchema.optional(),
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
