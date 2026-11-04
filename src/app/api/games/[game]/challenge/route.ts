import { HttpError } from "@/lib/errors";
import { isRankGame } from "@/lib/gameRank";
import { json, route } from "@/lib/http";
import { VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { challengeTarget } from "@/lib/repo/gameRank";

const cookieOf = (req: Request) => req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];

/** GET /api/games/:game/challenge — 🏁 도전할 다른 사람의 진짜 기록 {target, myBest, others} (11/4) */
export const GET = route<{ game: string }>(async (req, { game }) => {
  if (!isRankGame(game)) throw new HttpError(404, "no_game", "도전할 기록이 없는 게임이에요");
  const vid = cookieOf(req);
  return json(await challengeTarget(game, vid ? visitorHash(vid) : null));
});
