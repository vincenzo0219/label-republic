import { json, route } from "@/lib/http";
import { notFound } from "@/lib/errors";
import { getGig } from "@/lib/repo/gigs";

/** GET /api/gigs/:id — 대강·구인 글 (연락처 없음) */
export const GET = route<{ id: string }>(async (_req, { id }) => {
  const g = await getGig(id);
  if (!g || g.hidden) throw notFound("글");
  return json({ gig: g });
});
