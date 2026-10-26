import Link from "next/link";
import { ddayLabel, scheduleLines } from "@/lib/adSchedule";
import { myRoomEventPosts } from "@/lib/repo/adSchedule";
import { ttlMemo } from "@/lib/ttlMemo";
import { CalendarSubscribe } from "./CalendarSubscribe";

// 내 방 조합마다 5분 재사용 — 홈을 열 때마다 조회하지 않게
const cachedEvents = ttlMemo(myRoomEventPosts, 5 * 60_000);
/** "이번 주": 오늘부터 이 날수 안의 일정만 */
const WEEK_DAYS = 7;

/** 🎫 이번 주 내 방 행사 (10/25) — 내 방 홈 맨 위 한 줄, 가까운 일정 3개까지. 없으면 📅 달력 추가 버튼만 (10/26) */
export async function MyRoomEvents({ rooms, now = new Date() }: { rooms: string[]; now?: Date }) {
  if (!rooms.length) return null;
  const posts = await cachedEvents([...rooms].sort().join(",")).catch(() => []);
  const lines = scheduleLines(posts, now, 3).filter((l) => l.dday <= WEEK_DAYS);
  const cal = <CalendarSubscribe rooms={rooms} compact />;
  if (!lines.length)
    return (
      <section className="my-events" aria-label="내 방 행사 달력">
        {cal}
      </section>
    );
  return (
    <section className="my-events" aria-label="이번 주 내 방 행사">
      <span className="my-events-title">🎫 이번 주 내 방 행사</span>
      {lines.map((l) => (
        <Link key={`${l.postId}-${l.name}`} href={`/posts/${l.postId}`}>
          <span className="badge badge-dday">{ddayLabel(l.dday)}</span> {l.name}
        </Link>
      ))}
      {cal}
    </section>
  );
}
