import { fingerprint } from "@/lib/fingerprint";
import { json, route } from "@/lib/http";
import { getRules, listProposals, myVotes, ruleChanges, voterStatus } from "@/lib/repo/rules";

/** GET /api/rules — 현재 규칙 값, 진행 중·끝난 제안, 변경 이력, 내 투표 자격과 표 (Sprint 21) */
export const GET = route(async (req) => {
  const fp = fingerprint(req.headers);
  const [rules, open, closed, changes, me, votes] = await Promise.all([
    getRules(),
    listProposals({ status: "open" }),
    listProposals({ status: "closed", limit: 20 }),
    ruleChanges(20),
    voterStatus(fp),
    myVotes(fp),
  ]);
  return json({ rules, open, closed, changes, me: { weight: me.weight, reason: me.reason }, myVotes: votes });
});
