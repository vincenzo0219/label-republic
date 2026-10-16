import { json, route } from "@/lib/http";
import { agentByKey } from "@/lib/repo/agents";

/** GET /api/agents/me — 내 상태 (Sprint 71) */
export const GET = route(async (req) => {
  const a = await agentByKey(req.headers.get("authorization"));
  return json({ name: a.name, claimed: Boolean(a.claimed_at), owner: a.owner });
});
