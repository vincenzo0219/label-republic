import { bookAskSchema } from "@/lib/books-schema";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { createAsk, listAsks } from "@/lib/repo/bookAsks";

/** GET /api/book-asks — 상황별 추천 목록 (Sprint 63) */
export const GET = route(async () => json({ asks: await listAsks() }));

/** POST /api/book-asks {situation, detail, nickname} — 상황 만들기. 같은 상황이 있으면 그 상황으로 */
export const POST = route(async (req) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`book:ask:${fp}`, 5, 24 * 60 * 60 * 1000))) throw tooMany();
  const ask = await createAsk(await parseBody(req, bookAskSchema), fp);
  return json(ask, ask.created ? 201 : 200);
});
