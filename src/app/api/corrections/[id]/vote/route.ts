import { json, parseBody, route } from "@/lib/http";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { hit } from "@/lib/rate-limit";
import { voteCorrection } from "@/lib/repo/corrections";
import { voteSchema } from "@/lib/validation";

/** POST /api/corrections/:id/vote {value: 1 동의 | -1 반대} — 같은 값 재요청 시 취소 */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`vote:${fp}`, 60, 60 * 1000))) throw tooMany();
  const { value } = await parseBody(req, voteSchema);
  return json(await voteCorrection(id, fp, value));
});
