import { bookAnswerSchema } from "@/lib/books-schema";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { answerAsk } from "@/lib/repo/bookAsks";

/** POST /api/book-asks/:id/answers {title, author, reason, nickname} — 이 상황에 책 추천 (Sprint 63) */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`book:answer:${fp}`, 30, 60 * 60 * 1000))) throw tooMany();
  const result = await answerAsk(id, fp, await parseBody(req, bookAnswerSchema));
  return json(result, result.created ? 201 : 200);
});
