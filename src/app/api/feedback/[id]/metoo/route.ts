import { tooMany } from "@/lib/errors";
import { fingerprint, networkHash } from "@/lib/fingerprint";
import { json, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { toggleMetoo } from "@/lib/repo/feedback";

/** POST /api/feedback/:id/metoo — "나도 겪었어요" (다시 누르면 취소) */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`vote:${fp}`, 60, 60 * 1000))) throw tooMany();
  return json(await toggleMetoo(id, fp, networkHash(req.headers)));
});
