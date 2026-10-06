import { json, route } from "@/lib/http";
import { fingerprint } from "@/lib/fingerprint";
import { kickCuratorSoon } from "@/lib/jobs/curator";
import { voteBoardRequest } from "@/lib/repo/board-requests";

/** POST /api/board-requests/:id/vote — 임계치 도달 시 자동으로 categories에 승격 */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const result = await voteBoardRequest(id, fingerprint(req.headers));
  if (result.promoted) kickCuratorSoon();
  return json(result);
});
