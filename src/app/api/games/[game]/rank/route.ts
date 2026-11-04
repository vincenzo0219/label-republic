import { HttpError } from "@/lib/errors";
import { isRankGame, isRankPeriod } from "@/lib/gameRank";
import { json, route } from "@/lib/http";
import { VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { gameRanking } from "@/lib/repo/gameRank";

const cookieOf = (req: Request) => req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];

/** GET /api/games/:game/rank?period=today|week|all — 🏆 전국 랭킹 top 10 + 내 순위 (11/4) */
export const GET = route<{ game: string }>(async (req, { game }) => {
  if (!isRankGame(game)) throw new HttpError(404, "no_game", "랭킹이 없는 게임이에요");
  const p = new URL(req.url).searchParams.get("period");
  const vid = cookieOf(req);
  return json(await gameRanking(game, isRankPeriod(p) ? p : "all", vid ? visitorHash(vid) : null));
});
