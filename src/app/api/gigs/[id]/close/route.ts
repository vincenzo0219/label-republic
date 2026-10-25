import { json, parseBody, route } from "@/lib/http";
import { fingerprint } from "@/lib/fingerprint";
import { closeGig } from "@/lib/repo/gigs";
import { pinOnlySchema } from "@/lib/validation";

/** POST /api/gigs/:id/close {pw} — 글쓴이 마감 (목록에서 빠진다) */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const { pw } = await parseBody(req, pinOnlySchema);
  await closeGig(id, fingerprint(req.headers), pw);
  return json({ ok: true });
});
