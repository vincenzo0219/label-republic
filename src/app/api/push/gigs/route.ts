import { z } from "zod";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { getGigAlert, setGigAlert } from "@/lib/repo/gigs";

const schema = z.object({
  endpoint: z.string().url().max(1000),
  token: z.string().min(10).max(100),
  /** 없으면 지금 설정만 돌려준다, 빈 배열이면 끈다 */
  areas: z.array(z.string().max(30)).max(10).optional(),
  classes: z.array(z.string().max(20)).max(10).default([]),
});

/** POST /api/push/gigs {endpoint, token, areas?, classes} — 🔔 대강·구인 지역 알림 */
export const POST = route(async (req) => {
  if (!(await hit(`push:gigs:${fingerprint(req.headers)}`, 60, 3600_000))) throw tooMany();
  const { endpoint, token, areas, classes } = await parseBody(req, schema);
  const alert = areas === undefined ? await getGigAlert(endpoint, token) : await setGigAlert(endpoint, token, areas, classes);
  return json({ alert });
});
