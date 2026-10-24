import { z } from "zod";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { setProgramAlert } from "@/lib/repo/kidsPrograms";

const schema = z.object({
  endpoint: z.string().url().max(1000),
  token: z.string().min(10).max(100),
  programId: z.string().regex(/^[\w.:-]{1,60}$/),
  area: z.string().max(40).default(""),
  on: z.boolean(),
});

/** POST /api/push/kids {endpoint, token, programId, area, on} — 📍 동네 체험 🔔 접수 30분 전·시작 알림 */
export const POST = route(async (req) => {
  if (!(await hit(`push:kids:${fingerprint(req.headers)}`, 60, 3600_000))) throw tooMany();
  const { endpoint, token, programId, area, on } = await parseBody(req, schema);
  return json(await setProgramAlert(endpoint, token, programId, area, on));
});
