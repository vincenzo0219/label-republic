import { json, route } from "@/lib/http";
import { kstDay, VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { currentStreakInfo, noteCount, noteRooms, roomNotes } from "@/lib/repo/roomQuizzes";

/** GET /api/me/notes — 📚 내 지식 노트 (이 브라우저 기준, 로그인 없음). ?room=방 이면 그 방 카드 */
export const GET = route(async (req) => {
  const vid = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];
  if (!vid) return json({ rooms: [], streak: 0, best: 0, freezeLeft: 1, count: { knowledge: 0, total: 0 } });
  const vh = visitorHash(vid);
  const room = new URL(req.url).searchParams.get("room");
  if (room) return json({ notes: await roomNotes(vh, room.slice(0, 60)) });
  const [rooms, s, count] = await Promise.all([noteRooms(vh), currentStreakInfo(vh, kstDay()), noteCount(vh)]);
  return json({ rooms, streak: s.current, best: s.best, freezeLeft: s.freezeLeft, count });
});
