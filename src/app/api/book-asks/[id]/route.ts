import { notFound } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, route } from "@/lib/http";
import { getAsk } from "@/lib/repo/bookAsks";

/** GET /api/book-asks/:id — 상황과 추천된 책 */
export const GET = route<{ id: string }>(async (req, { id }) => {
  const ask = await getAsk(id, fingerprint(req.headers));
  if (!ask || ask.hidden) throw notFound("상황");
  return json(ask);
});
