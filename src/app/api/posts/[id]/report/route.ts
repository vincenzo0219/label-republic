import { json, parseBody, route } from "@/lib/http";
import { fingerprint } from "@/lib/fingerprint";
import { reportPost } from "@/lib/repo/posts";
import { reportSchema } from "@/lib/validation";

/** POST /api/posts/:id/report {reason} — 고유 신고 5건 누적 시 자동 블라인드 */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const { reason } = await parseBody(req, reportSchema);
  return json(await reportPost(id, fingerprint(req.headers), reason));
});
