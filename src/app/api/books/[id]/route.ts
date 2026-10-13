import { notFound } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, route } from "@/lib/http";
import { getBook } from "@/lib/repo/books";

/** GET /api/books/:id — 책 카드 (통계·기록·다음 책) */
export const GET = route<{ id: string }>(async (req, { id }) => {
  const book = await getBook(id, fingerprint(req.headers));
  if (!book) throw notFound("책");
  return json(book);
});
