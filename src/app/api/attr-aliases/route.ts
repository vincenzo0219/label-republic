import { notFound, tooMany } from "@/lib/errors";
import { fingerprint, networkHash } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { createProposal } from "@/lib/repo/attr-aliases";
import { getCategoryBySlug } from "@/lib/repo/categories";
import { attrAliasSchema } from "@/lib/validation";

/** POST /api/attr-aliases {board, attrKey, other, reason, nickname} — "같은 성분" 제안 (Sprint 35) */
export const POST = route(async (req) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`attr-alias:create:${fp}`, 10, 60 * 60 * 1000))) throw tooMany();
  const { board, ...input } = await parseBody(req, attrAliasSchema);
  const category = await getCategoryBySlug(board);
  if (!category) throw notFound("방");
  const proposal = await createProposal({ ...input, categoryId: category.id, fingerprint: fp, net: networkHash(req.headers) });
  return json({ proposal }, 201);
});
