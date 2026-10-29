import { json, parseBody, route } from "@/lib/http";
import { fingerprint } from "@/lib/fingerprint";
import { reportPost } from "@/lib/repo/posts";
import { reportSchema } from "@/lib/validation";

/** POST /api/posts/:id/report {reason} — 가리지 않고 운영자에게 보고 (10/29, 108) */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const { reason } = await parseBody(req, reportSchema);
  return json(await reportPost(id, fingerprint(req.headers), reason));
});
