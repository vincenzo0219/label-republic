import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { voteOnProposal } from "@/lib/repo/rules";
import { ruleVoteSchema } from "@/lib/validation";

type P = { id: string };

/** POST /api/rules/proposals/:id/vote {value: 1 찬성 | -1 반대 | 0 취소} — 마감 전까지 바꿀 수 있음 */
export const POST = route<P>(async (req, { id }) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`rule:vote:${fp}`, 30, 60 * 60 * 1000))) throw tooMany();
  const { value } = await parseBody(req, ruleVoteSchema);
  return json({ proposal: await voteOnProposal(id, fp, value) });
});
