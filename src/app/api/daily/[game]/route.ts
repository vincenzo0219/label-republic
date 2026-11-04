import { z } from "zod";
import { config } from "@/lib/config";
import { isDailyGame } from "@/lib/dailyGames";
import { HttpError, tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { newVisitorId, VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { hit } from "@/lib/rate-limit";
import { dailyStatus, setDailyTeam } from "@/lib/repo/dailyGames";

const cookieOf = (req: Request) => req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];

/** GET /api/daily/:game — 🎯 하루 게임 내 상태: 🔥 연속 · 오늘 순위 · 어제의 나 · 내 편 · 이번 주 편 대결 (11/4) */
export const GET = route<{ game: string }>(async (req, { game }) => {
  if (!isDailyGame(game)) throw new HttpError(404, "no_game", "없는 게임이에요");
  const vid = cookieOf(req);
  return json(await dailyStatus(game, vid ? visitorHash(vid) : null));
});

const schema = z.object({ team: z.string().min(1).max(30) });

/** POST /api/daily/:game {team} — 편 고르기 (애니: 장르, K리그: 응원 구단) */
export const POST = route<{ game: string }>(async (req, { game }) => {
  if (!isDailyGame(game)) throw new HttpError(404, "no_game", "없는 게임이에요");
  if (!(await hit(`daily:team:${fingerprint(req.headers)}`, 30, 3600_000))) throw tooMany();
  const { team } = await parseBody(req, schema);
  const cookie = cookieOf(req);
  const vid = cookie ?? newVisitorId();
  await setDailyTeam(game, visitorHash(vid), team);
  const res = json(await dailyStatus(game, visitorHash(vid)));
  if (!cookie) res.cookies.set(VISITOR_COOKIE, vid, { httpOnly: true, sameSite: "lax", secure: config.siteUrl.startsWith("https://"), maxAge: 60 * 60 * 24 * 365, path: "/" });
  return res;
});
