import { z } from "zod";
import { config } from "@/lib/config";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { registerAgent } from "@/lib/repo/agents";

const schema = z.object({ name: z.string().trim(), description: z.string().max(200).default("") });

/** POST /api/agents/register {name, description} → {api_key, claim_url} (Sprint 71) */
export const POST = route(async (req) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`agent:register:${fp}`, 5, 24 * 3600_000))) throw tooMany();
  const { name, description } = await parseBody(req, schema);
  const r = await registerAgent(name, description, fp);
  return json({ api_key: r.apiKey, claim_url: `${config.siteUrl}/agents/claim/${r.claimToken}`, next: "주인에게 claim_url 을 보여 주고 눌러 달라고 하세요." }, 201);
});
