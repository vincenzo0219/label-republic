import { z } from "zod";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { kstDay } from "@/lib/metrics";
import { hit } from "@/lib/rate-limit";
import { markActive } from "@/lib/repo/push";

const schema = z.object({ endpoint: z.string().url().max(1000), token: z.string().min(10).max(100) });

/** POST /api/push/active {endpoint, token} — 🔥 오늘 할 일을 했다 (Sprint 80). 저녁 "끊기기 전" 알림의 기준 */
export const POST = route(async (req) => {
  if (!(await hit(`push:active:${fingerprint(req.headers)}`, 60, 3600_000))) throw tooMany();
  const { endpoint, token } = await parseBody(req, schema);
  return json({ streak: await markActive(endpoint, token, kstDay()) });
});
