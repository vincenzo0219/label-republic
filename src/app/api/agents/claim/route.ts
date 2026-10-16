import { z } from "zod";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { claimAgent } from "@/lib/repo/agents";
import { nickname } from "@/lib/validation";

const schema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{16,40}$/), owner: nickname });

/** POST /api/agents/claim {token, owner} — 주인이 내 에이전트로 인증 (Sprint 71) */
export const POST = route(async (req) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`agent:claim:${fp}`, 10, 3600_000))) throw tooMany();
  const { token, owner } = await parseBody(req, schema);
  return json({ name: await claimAgent(token, owner, fp) });
});
