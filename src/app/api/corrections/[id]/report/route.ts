import { json, route } from "@/lib/http";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { hit } from "@/lib/rate-limit";
import { reportCorrection } from "@/lib/repo/corrections";

/** POST /api/corrections/:id/report — 고유 신고 5건이면 자동으로 가려진다 */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`report:${fp}`, 20, 60 * 60 * 1000))) throw tooMany();
  return json(await reportCorrection(id, fp));
});
