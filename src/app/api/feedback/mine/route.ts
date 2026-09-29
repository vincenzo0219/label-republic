import { z } from "zod";
import { verifiedFeedbackIds } from "@/lib/comment-token";
import { json, parseBody, route } from "@/lib/http";
import { listMine } from "@/lib/repo/feedback";

const MAX_MINE = 50;
const schema = z.object({ refs: z.array(z.string().max(40)).max(MAX_MINE * 2) });

/** POST /api/feedback/mine {refs: ["번호.증표"]} — 내 제보의 상태와 자세한 내용 (증표가 맞는 것만) */
export const POST = route(async (req) => {
  const { refs } = await parseBody(req, schema);
  return json({ items: await listMine(verifiedFeedbackIds(refs, MAX_MINE)) });
});
