import { json, parseBody, route } from "@/lib/http";
import { notFound } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { listComments } from "@/lib/repo/comments";
import { deletePost, getMyVote, getPost, updatePost } from "@/lib/repo/posts";
import { resolveSummary } from "@/lib/summary";
import { pinOnlySchema, updatePostSchema } from "@/lib/validation";

type P = { id: string };

/** GET /api/posts/:id — 상세 + AI 요약 + 댓글 */
export const GET = route<P>(async (req, { id }) => {
  const post = await getPost(id);
  if (!post) throw notFound();
  const [comments, myVote] = post.is_blinded
    ? [[], 0]
    : await Promise.all([listComments(id), getMyVote(id, fingerprint(req.headers))]);
  return json({ post, comments, myVote });
});

/** PATCH /api/posts/:id — 수정 (pw 검증) */
export const PATCH = route<P>(async (req, { id }) => {
  const input = await parseBody(req, updatePostSchema);
  const post = await updatePost(id, fingerprint(req.headers), input.pw, {
    title: input.title,
    body: input.body,
    summary: input.summary ? resolveSummary(input.summary, input.summaryToken) : null,
  });
  return json({ post });
});

/** DELETE /api/posts/:id — 삭제 (pw 검증) */
export const DELETE = route<P>(async (req, { id }) => {
  const { pw } = await parseBody(req, pinOnlySchema);
  await deletePost(id, fingerprint(req.headers), pw);
  return json({ ok: true });
});
