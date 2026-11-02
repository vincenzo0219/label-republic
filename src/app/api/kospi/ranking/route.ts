import { json, route } from "@/lib/http";
import { VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { kospiRanking } from "@/lib/repo/kospi";

const cookieOf = (req: Request) => req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];

/** GET /api/kospi/ranking?period=week: 🏆 이번 달(기본) 또는 이번 주 코스피 맞히기 순위 (위에서 5명) */
export const GET = route(async (req) => {
  const vid = cookieOf(req);
  const period = new URL(req.url).searchParams.get("period") === "week" ? "week" : "month";
  return json({ rows: await kospiRanking(vid ? visitorHash(vid) : null, new Date(), period) });
});
