import { z } from "zod";
import { HttpError } from "@/lib/errors";
import { json, parseBody, route } from "@/lib/http";
import { RADAR_ROOMS, radarSchema } from "@/lib/marketRadar";
import { STOCK_ROOM } from "@/lib/investRooms";
import { getRadar, putRadar } from "@/lib/repo/marketRadar";

// /api/admin/* 는 server.ts 에서 ADMIN_PASSWORD Basic 인증을 통과해야만 도달한다.
const schema = radarSchema.extend({ room: z.string().max(60).default(STOCK_ROOM) });

/** GET /api/admin/market-radar?room= — 지금 저장된 레이더 */
export const GET = route(async (req) => {
  const room = new URL(req.url).searchParams.get("room") ?? STOCK_ROOM;
  return json({ room, radar: await getRadar(room) });
});

/** PUT /api/admin/market-radar {room?, asOf, indices?, kospiNight?, usdkrw?, adrs?, flows?, cause?, sources?} — 통째로 바꾼다 */
export const PUT = route(async (req) => {
  const { room, ...radar } = await parseBody(req, schema);
  if (!RADAR_ROOMS.has(room)) throw new HttpError(400, "invalid_room", "레이더가 없는 방이에요.");
  await putRadar(room, radar);
  return json({ room, radar });
});
