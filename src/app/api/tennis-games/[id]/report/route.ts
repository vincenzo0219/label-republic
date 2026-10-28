import { json, parseBody, route } from "@/lib/http";
import { fingerprint } from "@/lib/fingerprint";
import { reportGame } from "@/lib/repo/tennisGames";
import { reportSchema } from "@/lib/validation";

/** POST /api/tennis-games/:id/report {reason} — 고유 신고가 쌓이면 목록에서 가린다 */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const { reason } = await parseBody(req, reportSchema);
  return json(await reportGame(id, fingerprint(req.headers), reason));
});
