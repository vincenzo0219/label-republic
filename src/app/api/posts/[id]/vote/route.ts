import { json, parseBody, route } from "@/lib/http";
import { fingerprint } from "@/lib/fingerprint";
import { votePost } from "@/lib/repo/posts";
import { voteSchema } from "@/lib/validation";

/** POST /api/posts/:id/vote {value: 1 | -1} — 같은 값 재요청 시 취소 */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const { value } = await parseBody(req, voteSchema);
  return json(await votePost(id, fingerprint(req.headers), value));
});
