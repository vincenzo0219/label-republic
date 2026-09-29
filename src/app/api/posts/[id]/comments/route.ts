import { json, parseBody, route } from "@/lib/http";
import { withIdempotency } from "@/lib/idempotency";
import { tooMany } from "@/lib/errors";
import { agentHash, fingerprint, networkHash } from "@/lib/fingerprint";
import { hit } from "@/lib/rate-limit";
import { commentRef } from "@/lib/comment-token";
import { createComment, listComments } from "@/lib/repo/comments";
import { assertCanWrite } from "@/lib/repo/write-limits";
import { commentSchema } from "@/lib/validation";

type P = { id: string };

export const GET = route<P>(async (_req, { id }) => json({ comments: await listComments(id) }));

/** POST /api/posts/:id/comments {nickname, pw, body, parentId?} */
export const POST = route<P>(async (req, { id }) => {
  const fp = fingerprint(req.headers);
  // 느린 망에서 같은 요청을 다시 보내도 한 번만 올라가게 (Idempotency-Key, Sprint 19)
  return withIdempotency(req, "comment", async () => {
    if (!(await hit(`comment:create:${fp}`, 20, 60 * 1000))) throw tooMany();
    // 망 단위로도 — 브라우저만 바꿔 댓글을 몰아 쓰는 것(기여 수 부풀리기 등) 방지 (Sprint 29)
    const net = networkHash(req.headers);
    if (!(await hit(`comment:create-net:${net}`, 60, 10 * 60 * 1000))) throw tooMany();
    const input = await parseBody(req, commentSchema);
    await assertCanWrite({ fingerprint: fp, net, agent: agentHash(req.headers) });
    const comment = await createComment(id, { nickname: input.nickname, pin: input.pw, body: input.body, fingerprint: fp, net, parentId: input.parentId });
    // 답글·멘션 알림을 받을 증표 — 쓴 브라우저만 받는다 (Sprint 33)
    return json({ comment, notifyRef: commentRef(String(comment.id)) }, 201);
  });
});
