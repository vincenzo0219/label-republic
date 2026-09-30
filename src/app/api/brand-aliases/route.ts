import { tooMany } from "@/lib/errors";
import { fingerprint, networkHash } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { createProposal } from "@/lib/repo/brand-aliases";
import { brandAliasSchema } from "@/lib/validation";

/** POST /api/brand-aliases {brandKey, other, reason, nickname} — "같은 브랜드" 제안 (Sprint 31) */
export const POST = route(async (req) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`brand-alias:create:${fp}`, 10, 60 * 60 * 1000))) throw tooMany();
  const input = await parseBody(req, brandAliasSchema);
  const proposal = await createProposal({ ...input, fingerprint: fp, net: networkHash(req.headers) });
  return json({ proposal }, 201);
});
