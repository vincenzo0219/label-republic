import { json, parseBody, route } from "@/lib/http";
import { fingerprint } from "@/lib/fingerprint";
import { after } from "next/server";
import { aiModerateComment, deleteComment, updateComment } from "@/lib/repo/comments";
import { commentEditSchema, pinOnlySchema } from "@/lib/validation";

/** DELETE /api/comments/:id {pw} */
export const DELETE = route<{ id: string }>(async (req, { id }) => {
  const { pw } = await parseBody(req, pinOnlySchema);
  await deleteComment(id, fingerprint(req.headers), pw);
  return json({ ok: true });
});

/** PATCH /api/comments/:id {pw, body} */
export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const { pw, body } = await parseBody(req, commentEditSchema);
  await updateComment(id, fingerprint(req.headers), pw, body);
  after(() => aiModerateComment(id).catch((err) => console.error("[moderation]", err)));
  return json({ ok: true });
});
