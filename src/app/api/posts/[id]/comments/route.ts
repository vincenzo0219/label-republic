import { json, parseBody, route } from "@/lib/http";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { hit } from "@/lib/rate-limit";
import { createComment, listComments } from "@/lib/repo/comments";
import { commentSchema } from "@/lib/validation";

type P = { id: string };

export const GET = route<P>(async (_req, { id }) => json({ comments: await listComments(id) }));

/** POST /api/posts/:id/comments {nickname, pw, body} */
export const POST = route<P>(async (req, { id }) => {
  if (!hit(`comment:create:${fingerprint(req.headers)}`, 20, 60 * 1000)) throw tooMany();
  const input = await parseBody(req, commentSchema);
  const comment = await createComment(id, { nickname: input.nickname, pin: input.pw, body: input.body });
  return json({ comment }, 201);
});
