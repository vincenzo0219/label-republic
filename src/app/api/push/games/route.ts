import { z } from "zod";
import { DAILY_GAMES } from "@/lib/dailyGames";
import { HttpError, tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { hit } from "@/lib/rate-limit";
import { setDailyPush } from "@/lib/repo/dailyGames";

const cookieOf = (req: Request) => req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];

const schema = z.object({
  endpoint: z.string().url().max(1000),
  token: z.string().min(10).max(100),
  game: z.enum(DAILY_GAMES),
  /** 없으면 지금 켜져 있는지만 */
  on: z.boolean().optional(),
});

/** POST /api/push/games {endpoint, token, game, on?} — 🔔 하루 게임 알림 (오늘 문제 열림 · 내 기록이 깨짐) 켜기/끄기 (11/4) */
export const POST = route(async (req) => {
  if (!(await hit(`push:games:${fingerprint(req.headers)}`, 60, 3600_000))) throw tooMany();
  const b = await parseBody(req, schema);
  const vid = cookieOf(req);
  if (!vid && b.on === true) throw new HttpError(400, "no_visitor", "게임을 한 번 한 뒤에 켤 수 있어요");
  return json({ on: await setDailyPush(b.endpoint, b.token, b.game, vid ? visitorHash(vid) : "", b.on) });
});
