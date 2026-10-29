import { json, route } from "@/lib/http";
import { kstDay, VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { nextQuizRoom } from "@/lib/repo/roomQuizzes";

/** GET /api/room-quiz/next?slug=지금방 — 오늘 아직 안 푼 다른 방 하나 ("다른 방 퀴즈도 풀기") */
export const GET = route(async (req) => {
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  const vid = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];
  if (!vid) return json(null);
  return json(await nextQuizRoom(visitorHash(vid), kstDay(), slug.slice(0, 60)));
});
