import { z } from "zod";
import { config } from "@/lib/config";
import { HttpError, tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { newVisitorId, VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { isGameId, validScore } from "@/lib/miniGames";
import { hit } from "@/lib/rate-limit";
import { gameBoard, recordPlay } from "@/lib/repo/miniGames";

const cookieOf = (req: Request) => req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];
const gameOf = (s: string) => {
  if (!isGameId(s)) throw new HttpError(404, "no_game", "없는 게임이에요");
  return s;
};

/** GET /api/games/:game — 🎮 내 최고 기록과 오늘 이 방 최고 기록 (10/29) */
export const GET = route<{ game: string }>(async (req, { game }) => {
  const g = gameOf(game);
  const vid = cookieOf(req);
  return json(await gameBoard(g, vid ? visitorHash(vid) : null));
});

const schema = z.object({ score: z.number() });

/** POST /api/games/:game {score} — 한 판 저장. 범위 밖 점수는 받지 않는다 */
export const POST = route<{ game: string }>(async (req, { game }) => {
  const g = gameOf(game);
  if (!(await hit(`games:play:${fingerprint(req.headers)}`, 120, 3600_000))) throw tooMany();
  const { score } = await parseBody(req, schema);
  if (!validScore(g, score)) throw new HttpError(400, "bad_score", "기록을 저장하지 못했어요");
  const cookie = cookieOf(req);
  const vid = cookie ?? newVisitorId();
  const res = json(await recordPlay(g, visitorHash(vid), score));
  if (!cookie) res.cookies.set(VISITOR_COOKIE, vid, { httpOnly: true, sameSite: "lax", secure: config.siteUrl.startsWith("https://"), maxAge: 60 * 60 * 24 * 365, path: "/" });
  return res;
});
