import { roomVisitorsTotal } from "@/lib/repo/metrics";

// 전체 기록을 훑는 쿼리라 방마다 1시간에 한 번만 센다
const g = globalThis as unknown as { __lrRoomVisitors?: Map<string, { at: number; n: number }> };
const TTL = 60 * 60_000;
/** 숫자가 작으면 오히려 빈 방처럼 보여서 숨긴다 */
export const ROOM_VISITORS_MIN = 20;

/** 방 이름 옆: 지금까지 이 방에 온 실제 사람 수 (20명 이상일 때만) */
export async function RoomVisitors({ slug }: { slug: string }) {
  const cache = (g.__lrRoomVisitors ??= new Map());
  let hit = cache.get(slug);
  if (!hit || Date.now() - hit.at > TTL) {
    const n = await roomVisitorsTotal(slug).catch(() => null);
    if (n === null) return null;
    hit = { at: Date.now(), n };
    cache.set(slug, hit);
  }
  if (hit.n < ROOM_VISITORS_MIN) return null;
  return <span className="room-visitors" title="지금까지 이 방에 온 사람" aria-label={`지금까지 이 방에 온 사람 ${hit.n}명`}>👥 {hit.n.toLocaleString()}</span>;
}
