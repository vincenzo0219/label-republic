import { quickReadSchema } from "@/lib/books-schema";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { quickRead, readingLines } from "@/lib/repo/books";

/** GET /api/books/lines — 📖 지금 읽는 책 한 줄 피드 (Sprint 82) */
export const GET = route(async () => json({ lines: await readingLines() }));

/** POST /api/books/lines {title, line, nickname} — 제목과 한마디로 "읽는 중" 남기기 */
export const POST = route(async (req) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`book:line:${fp}`, 20, 60 * 60 * 1000))) throw tooMany();
  const input = await parseBody(req, quickReadSchema);
  await quickRead(fp, input);
  return json({ lines: await readingLines() }, 201);
});
