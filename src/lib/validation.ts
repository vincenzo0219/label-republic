import { z } from "zod";
import { RULE_KEYS } from "./rules";
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
// 예전 이름(라벨공화국)도 사칭에 쓰이지 않게 막는다 (Sprint 37)
const RESERVED_CONTAINS = ["큐레이터", "운영자", "관리자", "운영팀", "노방장", "라벨공화국", "방장"];
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

/** 출처 — 주소 검증·정규화는 저장할 때(src/lib/sources.ts) 한다 */
export const sourceRefsSchema = z
  .array(
    z.object({
      url: z.string().trim().min(1, "출처 주소를 입력해주세요.").max(600, "출처 주소가 너무 깁니다."),
      label: z.string().trim().max(200, "출처 설명은 200자까지 쓸 수 있습니다.").default(""),
    }),
  )
  .max(8, "출처는 8개까지 달 수 있습니다.");

/** 제품 라벨 날짜 (Sprint 26) — 형식 검사는 저장할 때 src/lib/label-dates.ts */
const productDates = {
  made: z.string().trim().max(20, "제조일자가 너무 깁니다.").optional(),
  expires: z.string().trim().max(20, "유통기한이 너무 깁니다.").optional(),
  /** 날짜를 읽은(또는 보여주는) 첨부 사진 */
  dateImage: z.string().uuid("날짜 근거 사진 정보가 올바르지 않습니다.").optional(),
  /** 라벨 읽기로 채운 날짜 — 서버가 읽은 결과와 비교해 그대로인지/고쳤는지 기록한다 */
  dateFromLabel: z.boolean().optional(),
};

/** 제품 태그 — 이미 있는 제품은 id, 새 제품은 브랜드·제품명 (이름 규칙 검사는 저장할 때 src/lib/products.ts) */
export const productRefsSchema = z
  .array(
    z.union([
      z.object({ id: z.string().regex(/^\d{1,18}$/, "제품 정보가 올바르지 않습니다."), ...productDates }),
      z.object({
        brand: z.string().trim().min(1, "브랜드를 입력해주세요.").max(60, "브랜드는 60자까지 입력할 수 있습니다."),
        name: z.string().trim().min(1, "제품명을 입력해주세요.").max(120, "제품명은 120자까지 입력할 수 있습니다."),
        ...productDates,
      }),
    ]),
  )
  .max(3, "제품은 글당 3개까지 태그할 수 있습니다.");

/** 제품 수치 — product 는 같은 요청 products 의 순서 */
export const factsSchema = z
  .array(
    z.object({
      product: z.number().int().min(0).max(2),
      attribute: z.string().trim().min(1, "수치 항목 이름을 입력해주세요.").max(40, "수치 항목 이름은 40자까지 쓸 수 있습니다."),
      value: z.number({ error: "수치 값을 숫자로 입력해주세요." }).finite().min(0, "수치는 0 이상이어야 합니다.").max(999_999_999_999, "수치가 너무 큽니다."),
      unit: z.string().trim().min(1, "단위를 입력해주세요.").max(12, "단위는 12자까지 쓸 수 있습니다."),
      basis: z.string().trim().max(30, "기준은 30자까지 쓸 수 있습니다.").default(""),
      kind: z.enum(["label", "measured"], { error: "표시값/실측값을 선택해주세요." }),
      /** 근거 사진 (이 글에 첨부한 사진 id, Sprint 20) */
      image: z.string().uuid("근거 사진 정보가 올바르지 않습니다.").optional(),
      /** 라벨 읽기로 채운 수치인지 — 서버가 읽은 결과와 비교해 그대로인지/고쳤는지 기록한다 */
      fromLabel: z.boolean().optional(),
    }),
  )
  .max(20, "수치는 글당 20개까지 적을 수 있습니다.");

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
  sources: sourceRefsSchema.optional(),
  products: productRefsSchema.optional(),
  facts: factsSchema.optional(),
});

export const updatePostSchema = z.object({
  pw: pin,
  title: trimmed(2, 120, "제목").optional(),
  body: trimmed(10, 20000, "본문").optional(),
  summary: summaryLines.optional(),
  summaryToken: z.string().max(4000).optional(),
  images: imageRefsSchema.optional(),
  sources: sourceRefsSchema.optional(),
  products: productRefsSchema.optional(),
  facts: factsSchema.optional(),
});

export const pinOnlySchema = z.object({ pw: pin });

export const voteSchema = z.object({ value: z.union([z.literal(1), z.literal(-1)]) });

export const reportSchema = z.object({ reason: z.string().trim().max(200).default("") });

export const commentSchema = z.object({
  nickname,
  pw: pin,
  body: trimmed(1, 1000, "댓글"),
  /** 답글이면 답하는 댓글 번호 (Sprint 30) */
  parentId: z.string().regex(/^\d{1,18}$/).optional(),
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
  name: trimmed(2, 40, "방 이름"),
  description: z.string().trim().max(300).default(""),
});

export function firstIssue(err: z.ZodError): string {
  return err.issues[0]?.message ?? "입력값이 올바르지 않습니다.";
}

/** 정정 제안 (Sprint 15) — 인용·수치 확인은 저장할 때(src/lib/repo/corrections.ts) */
export const correctionSchema = z.object({
  nickname,
  pw: pin,
  target: z.enum(["fact", "text", "other"], { error: "무엇을 정정할지 골라주세요." }),
  factIndex: z.number().int().min(0).max(19).optional(),
  quote: z.string().trim().max(300, "인용은 300자까지 쓸 수 있습니다.").default(""),
  proposal: trimmed(2, 300, "정정 내용"),
  reason: trimmed(10, 1000, "근거 설명"),
  sourceUrl: z.string().trim().max(600, "근거 링크가 너무 깁니다.").default(""),
});

export const correctionRespondSchema = z.object({
  pw: pin,
  action: z.enum(["applied", "answered"]),
  note: z.string().trim().max(300, "답변은 300자까지 쓸 수 있습니다.").default(""),
});

/** 커뮤니티 규칙 변경 제안 (Sprint 21) */
export const ruleProposalSchema = z.object({
  key: z.enum(RULE_KEYS, { error: "바꿀 규칙을 골라주세요." }),
  value: z.number({ error: "새 값을 숫자로 입력해주세요." }).finite(),
  reason: trimmed(20, 1000, "제안 이유"),
  nickname,
  pw: pin,
});

/** 브랜드 별칭 제안 (Sprint 31): 지금 브랜드 페이지의 키 + 같은 브랜드라고 보는 다른 표기 */
export const brandAliasSchema = z.object({
  brandKey: z.string().min(1).max(60),
  other: trimmed(1, 60, "다른 표기"),
  reason: trimmed(10, 500, "이유"),
  nickname,
});

/** 성분명 별칭 제안 (Sprint 35) — board: 방 slug, attrKey: 순위 화면의 항목 키, other: 같은 성분의 다른 이름 */
export const attrAliasSchema = z.object({
  board: z.string().min(1).max(60),
  attrKey: z.string().min(1).max(40),
  other: trimmed(1, 40, "다른 이름"),
  reason: trimmed(10, 500, "이유"),
  nickname,
});

/** 피드백·버그 제보 (Sprint 36). website 는 사람에게 보이지 않는 칸 — 채워져 있으면 자동 제출로 본다 */
export const feedbackSchema = z.object({
  kind: z.enum(["bug", "idea", "other"], { error: "제보 종류를 골라주세요." }),
  title: trimmed(4, 80, "제목"),
  body: trimmed(10, 2000, "내용"),
  pagePath: z.string().max(500).optional(),
  env: z
    .object({
      browser: z.string().max(40).optional(),
      os: z.string().max(40).optional(),
      viewport: z.string().max(12).optional(),
      standalone: z.boolean().optional(),
      online: z.boolean().optional(),
    })
    .nullable()
    .optional(),
  website: z.string().max(200).optional(),
});

export const ruleVoteSchema = z.object({ value: z.union([z.literal(1), z.literal(-1), z.literal(0)], { error: "찬성·반대를 골라주세요." }) });
