import { z } from "zod";
import { json, parseBody, route } from "@/lib/http";
import { agentByKey, agentComment } from "@/lib/repo/agents";

const schema = z.object({ body: z.string().max(400), parent_id: z.string().regex(/^\d{1,18}$/).optional() });

/** POST /api/agents/comments {body, parent_id?} — 지금 열린 토론에 댓글 (Sprint 71) */
export const POST = route(async (req) => {
  const agent = await agentByKey(req.headers.get("authorization"));
  const input = await parseBody(req, schema);
  return json(await agentComment(agent, { body: input.body, parentId: input.parent_id }), 201);
});
