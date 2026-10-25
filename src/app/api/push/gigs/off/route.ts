import { z } from "zod";
import { HttpError, tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { offGigAlertByToken } from "@/lib/repo/gigs";

/** POST /api/push/gigs/off {u} — 알림에서 들어와 한 번 눌러 대강 알림 끄기 (u = 알림 주소에 붙은 증표) */
export const POST = route(async (req) => {
  if (!(await hit(`push:gigs-off:${fingerprint(req.headers)}`, 30, 3600_000))) throw tooMany();
  const { u } = await parseBody(req, z.object({ u: z.string().max(60) }));
  if (!(await offGigAlertByToken(u))) throw new HttpError(400, "invalid_token", "알림을 끄지 못했어요");
  return json({ ok: true });
});
