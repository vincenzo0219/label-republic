import { z } from "zod";
import { BOOK_STATUSES } from "./books";

/** 책 카드 입력 검증 (Sprint 62) — 브라우저 번들에 zod 가 실리지 않게 books.ts 와 나눈다 */
const text = (max: number, label: string) => z.string().trim().max(max, `${label}은(는) ${max}자 이하여야 합니다.`);

export const bookCreateSchema = z.object({
  title: text(80, "제목").min(1, "제목을 입력해 주세요."),
  author: text(40, "저자").default(""),
});

export const bookReadSchema = z
  .object({
    status: z.enum(BOOK_STATUSES),
    progress: z.number().int().min(0).max(100).default(0),
    line: text(200, "한 줄").default(""),
    nextTitle: text(80, "다음 책 제목").default(""),
    nickname: text(20, "닉네임").min(2, "닉네임은 2자 이상이어야 합니다."),
  })
  // 완독이면 100%, 진도는 5% 단위로만 (정밀한 숫자는 의미가 없다)
  .transform((r) => ({ ...r, progress: r.status === "done" ? 100 : Math.round(r.progress / 5) * 5 }));

