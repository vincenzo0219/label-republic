import { json, parseBody, route } from "@/lib/http";
import { fingerprint } from "@/lib/fingerprint";
import { reportComment } from "@/lib/repo/comments";
import { reportSchema } from "@/lib/validation";

/** POST /api/comments/:id/report {reason} — 댓글·채팅 한 줄 신고. 서로 다른 신고 3건이면 가린다 (098) */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const { reason } = await parseBody(req, reportSchema);
  return json(await reportComment(id, fingerprint(req.headers), reason));
});
