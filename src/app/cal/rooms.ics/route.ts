import { config } from "@/lib/config";
import { calendarPosts, countCalendarFetch } from "@/lib/repo/roomCalendar";
import { parseCalRooms, roomCalendarIcs } from "@/lib/roomCalendar";
import { ttlMemo } from "@/lib/ttlMemo";

export const dynamic = "force-dynamic";

// 달력 앱은 몇 시간마다 다시 가져간다. 같은 방 조합은 5분 재사용
const cachedPosts = ttlMemo((key: string) => calendarPosts(key.split(",")), 5 * 60_000);

/**
 * GET /cal/rooms.ics?r=방,방 — 📅 내 폰 달력에 추가 (10/26). 방들의 [행사]·[혜택] 날짜를 구독 달력으로.
 * 방은 최대 10개. 가져간 횟수만 하루 단위로 센다 (누가·어느 방인지 남기지 않음).
 */
export async function GET(req: Request) {
  const rooms = parseCalRooms(new URL(req.url).searchParams.get("r"));
  if (!rooms.length) return new Response("r=방주소 를 넣어 주세요.", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  void countCalendarFetch().catch(() => {});
  const posts = await cachedPosts(rooms.join(",")).catch(() => null);
  if (!posts) return new Response("잠시 뒤 다시 시도해 주세요.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "600" } });
  return new Response(roomCalendarIcs(posts, config.siteUrl), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="nobangjang-rooms.ics"',
      "Cache-Control": "public, max-age=600",
    },
  });
}
