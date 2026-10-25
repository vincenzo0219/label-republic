import { after } from "next/server";
import { z } from "zod";
import { json, parseBody, route } from "@/lib/http";
import { HttpError, tooMany } from "@/lib/errors";
import { agentHash, fingerprint, networkHash } from "@/lib/fingerprint";
import { hit } from "@/lib/rate-limit";
import { claimNickname } from "@/lib/repo/nicknames";
import { assertCanWrite } from "@/lib/repo/write-limits";
import { createGig, listGigs, moderateGig } from "@/lib/repo/gigs";
import { CLASS_TYPES, SIDOS, gigInputSchema } from "@/lib/instructorRoom";

const filterSchema = z.object({
  sido: z.string().refine((v) => SIDOS.includes(v)).optional(),
  sigungu: z.string().max(20).optional(),
  when: z.enum(["today", "week"]).optional(),
  classType: z.enum(CLASS_TYPES).optional(),
  kind: z.enum(["sub", "regular"]).optional(),
  page: z.coerce.number().int().min(1).max(50).optional(),
});

/** GET /api/gigs?sido=&sigungu=&when=today|week&classType=&kind=&page= — 📋 대강·구인 목록 (연락처 없음) */
export const GET = route(async (req) => {
  const sp = Object.fromEntries([...new URL(req.url).searchParams].filter(([, v]) => v !== ""));
  const f = filterSchema.safeParse(sp);
  if (!f.success) throw new HttpError(400, "invalid_filter", "거르기 값이 올바르지 않습니다.");
  const r = await listGigs(f.data);
  return new Response(JSON.stringify(r), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
});

/** POST /api/gigs — 대강·구인 글 올리기 */
export const POST = route(async (req) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`gig:create:${fp}`, 10, 3600_000))) throw tooMany();
  if (!(await hit(`gig:create-net:${networkHash(req.headers)}`, 30, 3600_000))) throw tooMany();
  const input = await parseBody(req, gigInputSchema);
  await claimNickname(input.nickname, input.pw);
  await assertCanWrite({ fingerprint: fp, net: networkHash(req.headers), agent: agentHash(req.headers) });
  try {
    const r = await createGig(input, { fingerprint: fp, net: networkHash(req.headers) });
    after(() => moderateGig(r.id).catch((err) => console.error("[gig moderation]", err)));
    return json(r, 201);
  } catch (err) {
    const id = (err as { gigId?: string }).gigId;
    if (err instanceof HttpError && id) return json({ error: { code: err.code, message: err.message }, id }, err.status);
    throw err;
  }
});
