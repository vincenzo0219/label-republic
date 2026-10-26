import { z } from "zod";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { setRoomAlerts } from "@/lib/repo/push";

const schema = z.object({
  endpoint: z.string().url().max(1000),
  token: z.string().min(10).max(100),
  on: z.boolean(),
  rooms: z.array(z.string().min(1).max(60)).max(20).default([]),
});

/** POST /api/push/rooms {endpoint, token, on, rooms} — 🆕 내 방 새 글 알림 켜기/끄기, 내 방 목록 맞추기 (10/25) */
export const POST = route(async (req) => {
  if (!(await hit(`push:rooms:${fingerprint(req.headers)}`, 60, 3600_000))) throw tooMany();
  const { endpoint, token, on, rooms } = await parseBody(req, schema);
  return json(await setRoomAlerts(endpoint, token, on, rooms));
});
