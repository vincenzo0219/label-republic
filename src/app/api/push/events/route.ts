import { z } from "zod";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { setEventRoom } from "@/lib/repo/push";

const schema = z.object({
  endpoint: z.string().url().max(1000),
  token: z.string().min(10).max(100),
  slug: z.string().min(1).max(60),
  on: z.boolean(),
});

/** POST /api/push/events {endpoint, token, slug, on} — 🎫 이 방 새 행사 알림 켜기/끄기 */
export const POST = route(async (req) => {
  if (!(await hit(`push:events:${fingerprint(req.headers)}`, 60, 3600_000))) throw tooMany();
  const { endpoint, token, slug, on } = await parseBody(req, schema);
  return json({ rooms: await setEventRoom(endpoint, token, slug, on) });
});
