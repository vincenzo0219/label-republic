import Link from "next/link";
import { ddayLabel, scheduleLines } from "@/lib/adSchedule";
import { myRoomEventPosts } from "@/lib/repo/adSchedule";
import { ttlMemo } from "@/lib/ttlMemo";

// 내 방 조합마다 5분 재사용 — 홈을 열 때마다 조회하지 않게
const cachedEvents = ttlMemo(myRoomEventPosts, 5 * 60_000);
/** "이번 주": 오늘부터 이 날수 안의 일정만 */
const WEEK_DAYS = 7;

/** 🎫 이번 주 내 방 행사 (10/25) — 내 방 홈 맨 위 한 줄, 가까운 일정 3개까지. 없으면 안 보인다 */
export async function MyRoomEvents({ rooms, now = new Date() }: { rooms: string[]; now?: Date }) {
  if (!rooms.length) return null;
  const posts = await cachedEvents([...rooms].sort().join(",")).catch(() => []);
  const lines = scheduleLines(posts, now, 3).filter((l) => l.dday <= WEEK_DAYS);
  if (!lines.length) return null;
  return (
    <section className="my-events" aria-label="이번 주 내 방 행사">
      <span className="my-events-title">🎫 이번 주 내 방 행사</span>
      {lines.map((l) => (
        <Link key={`${l.postId}-${l.name}`} href={`/posts/${l.postId}`}>
          <span className="badge badge-dday">{ddayLabel(l.dday)}</span> {l.name}
        </Link>
      ))}
    </section>
  );
}
