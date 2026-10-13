import { bookReadSchema } from "@/lib/books-schema";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { getBook, saveBookRead } from "@/lib/repo/books";

/** POST /api/books/:id/read {status, progress, line, nextTitle, nickname} — 내 기록 남기기·고치기 (Sprint 62) */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`book:read:${fp}`, 30, 60 * 60 * 1000))) throw tooMany();
  const input = await parseBody(req, bookReadSchema);
  const { created } = await saveBookRead(id, fp, input);
  return json({ created, book: await getBook(id, fp) }, created ? 201 : 200);
});
