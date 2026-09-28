import { tooMany } from "@/lib/errors";
import { fingerprint, networkHash } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { withIdempotency } from "@/lib/idempotency";
import { hit } from "@/lib/rate-limit";
import { createProposal } from "@/lib/repo/rules";
import { ruleProposalSchema } from "@/lib/validation";

/** POST /api/rules/proposals {key, value, reason, nickname, pw} — 규칙 변경 제안 (7일 투표 시작, 제안자는 찬성으로 셈) */
export const POST = route(async (req) => {
  const fp = fingerprint(req.headers);
  return withIdempotency(req, "rule_proposal", async () => {
    if (!(await hit(`rule:propose:${fp}`, 5, 60 * 60 * 1000))) throw tooMany();
    const input = await parseBody(req, ruleProposalSchema);
    const proposal = await createProposal({ key: input.key, value: input.value, reason: input.reason, nickname: input.nickname, pin: input.pw, fingerprint: fp, netHash: networkHash(req.headers) });
    return json({ proposal }, 201);
  });
});
