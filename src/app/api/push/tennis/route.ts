import { z } from "zod";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { getTennisAlert, setTennisAlert } from "@/lib/repo/tennisAlerts";

const schema = z.object({
  endpoint: z.string().url().max(1000),
  token: z.string().min(10).max(100),
  /** 없으면 지금 설정만 돌려준다, 빈 배열이면 끈다 */
  areas: z.array(z.string().max(30)).max(10).optional(),
  types: z.array(z.string().max(10)).max(10).default([]),
});

/** POST /api/push/tennis {endpoint, token, areas?, types} — 🔔 우리 동네 새 게임 알림 */
export const POST = route(async (req) => {
  if (!(await hit(`push:tennis:${fingerprint(req.headers)}`, 60, 3600_000))) throw tooMany();
  const { endpoint, token, areas, types } = await parseBody(req, schema);
  const alert = areas === undefined ? await getTennisAlert(endpoint, token) : await setTennisAlert(endpoint, token, areas, types);
  return json({ alert });
});
