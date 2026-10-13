import { bookCreateSchema } from "@/lib/books-schema";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { createBook, listBooks } from "@/lib/repo/books";

/** GET /api/books — 최근 기록 순 책 카드 (Sprint 62) */
export const GET = route(async () => json({ books: await listBooks() }));

/** POST /api/books {title, author} — 책 카드 만들기. 같은 책이 있으면 그 카드로 */
export const POST = route(async (req) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`book:create:${fp}`, 10, 24 * 60 * 60 * 1000))) throw tooMany();
  const { title, author } = await parseBody(req, bookCreateSchema);
  const book = await createBook(title, author, fp);
  return json(book, book.created ? 201 : 200);
});
