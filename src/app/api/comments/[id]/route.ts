import { json, parseBody, route } from "@/lib/http";
import { fingerprint } from "@/lib/fingerprint";
import { deleteComment } from "@/lib/repo/comments";
import { pinOnlySchema } from "@/lib/validation";

/** DELETE /api/comments/:id {pw} */
export const DELETE = route<{ id: string }>(async (req, { id }) => {
  const { pw } = await parseBody(req, pinOnlySchema);
  await deleteComment(id, fingerprint(req.headers), pw);
  return json({ ok: true });
});
