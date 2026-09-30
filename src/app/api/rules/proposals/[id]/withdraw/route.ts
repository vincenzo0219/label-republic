import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { withdrawProposal } from "@/lib/repo/rules";
import { pinOnlySchema } from "@/lib/validation";

type P = { id: string };

/** POST /api/rules/proposals/:id/withdraw {pw} — 제안자가 투표 마감 전에 철회 */
export const POST = route<P>(async (req, { id }) => {
  const { pw } = await parseBody(req, pinOnlySchema);
  await withdrawProposal(id, fingerprint(req.headers), pw);
  return json({ ok: true });
});
