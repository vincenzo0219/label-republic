import { json, parseBody, route } from "@/lib/http";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { hit } from "@/lib/rate-limit";
import { votePost } from "@/lib/repo/posts";
import { voteSchema } from "@/lib/validation";

/** POST /api/posts/:id/vote {value: 1 | -1} — 같은 값 재요청 시 취소 */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const fp = fingerprint(req.headers);
  if (!hit(`vote:${fp}`, 60, 60 * 1000)) throw tooMany();
  const { value } = await parseBody(req, voteSchema);
  return json(await votePost(id, fp, value));
});
