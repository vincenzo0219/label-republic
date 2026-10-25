import { z } from "zod";
import { json, parseBody, route } from "@/lib/http";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { hit } from "@/lib/rate-limit";
import { parseGig } from "@/lib/gigParse";

/** POST /api/gigs/parse {text} — 카톡 대강 글 → 칸 채우기 (저장하지 않음) */
export const POST = route(async (req) => {
  if (!(await hit(`gig:parse:${fingerprint(req.headers)}`, 60, 600_000))) throw tooMany();
  const { text } = await parseBody(req, z.object({ text: z.string().max(6000) }));
  return json({ draft: parseGig(text) });
});
