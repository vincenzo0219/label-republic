import { z } from "zod";
import { config } from "@/lib/config";
import { HttpError, tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { newVisitorId, VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { isGameId } from "@/lib/miniGames";
import { hit } from "@/lib/rate-limit";
import { recordOpen } from "@/lib/repo/miniGames";

const cookieOf = (req: Request) => req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];
const schema = z.object({ src: z.enum(["room", "direct", "challenge"]) });

/** POST /api/games/:game/open {src} — 🎮 게임 화면을 연 기록 (관리자 "방 버튼 클릭" 수) */
export const POST = route<{ game: string }>(async (req, { game }) => {
  if (!isGameId(game)) throw new HttpError(404, "no_game", "없는 게임이에요");
  if (!(await hit(`games:open:${fingerprint(req.headers)}`, 60, 3600_000))) throw tooMany();
  const { src } = await parseBody(req, schema);
  const cookie = cookieOf(req);
  const vid = cookie ?? newVisitorId();
  await recordOpen(game, visitorHash(vid), src);
  const res = json({ ok: true });
  if (!cookie) res.cookies.set(VISITOR_COOKIE, vid, { httpOnly: true, sameSite: "lax", secure: config.siteUrl.startsWith("https://"), maxAge: 60 * 60 * 24 * 365, path: "/" });
  return res;
});
