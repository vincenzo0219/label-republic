import { z } from "zod";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { setSavingsDay } from "@/lib/repo/push";

const schema = z.object({
  endpoint: z.string().url().max(1000),
  token: z.string().min(10).max(100),
  day: z.number().int().min(1).max(28).nullable(),
});

/** POST /api/push/savings {endpoint, token, day} — 💰 매달 적립일 알림 (1~28일, KST 오전 9시). null 이면 끈다 */
export const POST = route(async (req) => {
  if (!(await hit(`push:savings:${fingerprint(req.headers)}`, 30, 3600_000))) throw tooMany();
  const { endpoint, token, day } = await parseBody(req, schema);
  return json({ day: await setSavingsDay(endpoint, token, day) });
});
