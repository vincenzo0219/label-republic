import { json, parseBody, route } from "@/lib/http";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { hit } from "@/lib/rate-limit";
import { createCorrection, listCorrections } from "@/lib/repo/corrections";
import { correctionSchema } from "@/lib/validation";

type P = { id: string };

/** GET /api/posts/:id/corrections — 정정 제안 목록 (+ 내 투표) */
export const GET = route<P>(async (req, { id }) => json(await listCorrections(id, fingerprint(req.headers))));

/** POST /api/posts/:id/corrections — 정정 제안 */
export const POST = route<P>(async (req, { id }) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`correction:create:${fp}`, 5, 60 * 60 * 1000))) throw tooMany();
  const input = await parseBody(req, correctionSchema);
  const correction = await createCorrection(id, {
    nickname: input.nickname,
    pin: input.pw,
    target: input.target,
    factIndex: input.factIndex,
    quote: input.quote,
    proposal: input.proposal,
    reason: input.reason,
    sourceUrl: input.sourceUrl,
    fingerprint: fp,
  });
  return json({ correction }, 201);
});
