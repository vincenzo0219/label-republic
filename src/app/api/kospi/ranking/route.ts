import { json, route } from "@/lib/http";
import { VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { kospiRanking } from "@/lib/repo/kospi";

const cookieOf = (req: Request) => req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];

/** GET /api/kospi/ranking — 🏆 이번 달 코스피 맞히기 순위 (위에서 5명) */
export const GET = route(async (req) => {
  const vid = cookieOf(req);
  return json({ rows: await kospiRanking(vid ? visitorHash(vid) : null) });
});
