import { z } from "zod";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { getCourtSubs, setCourtSub } from "@/lib/repo/tennisAlerts";

const schema = z.object({
  endpoint: z.string().url().max(1000),
  token: z.string().min(10).max(100),
  /** 없으면 지금 켜 둔 코트만 돌려준다 */
  courtId: z.number().int().positive().optional(),
  on: z.boolean().default(true),
});

/** POST /api/push/court-opens {endpoint, token, courtId?, on} — 🔔 공공 코트 예약 오픈 알림 켜고 끄기 */
export const POST = route(async (req) => {
  if (!(await hit(`push:courts:${fingerprint(req.headers)}`, 60, 3600_000))) throw tooMany();
  const { endpoint, token, courtId, on } = await parseBody(req, schema);
  const courts = courtId === undefined ? await getCourtSubs(endpoint, token) : await setCourtSub(endpoint, token, courtId, on);
  return json({ courts });
});
