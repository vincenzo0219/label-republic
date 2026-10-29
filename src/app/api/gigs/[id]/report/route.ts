import { json, parseBody, route } from "@/lib/http";
import { fingerprint } from "@/lib/fingerprint";
import { reportGig } from "@/lib/repo/gigs";
import { reportSchema } from "@/lib/validation";

/** POST /api/gigs/:id/report {reason} — 글 신고와 같은 방식. 가리지 않고 운영자에게 보고 */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const { reason } = await parseBody(req, reportSchema);
  return json(await reportGig(id, fingerprint(req.headers), reason));
});
