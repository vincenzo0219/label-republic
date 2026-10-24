import Link from "next/link";
import { ddayLabel, latestEventTitles, scheduleLines, type SchedulePost } from "@/lib/adSchedule";

/** 🎫 이번 주 일정 — 광고(?from=ig_*)로 들어온 첫 화면 맨 위. 날짜를 못 찾으면 최근 [행사] 제목 2개, 그것도 없으면 안 보인다 */
export function AdSchedule({ posts, slug, now = new Date() }: { posts: SchedulePost[]; slug: string; now?: Date }) {
  const lines = scheduleLines(posts, now);
  const items = lines.length ? lines : latestEventTitles(posts).map((t) => ({ ...t, when: "", dday: null as number | null }));
  if (items.length === 0) return null;
  return (
    <section className="writing-log market-card ad-schedule" aria-label="이번 주 일정">
      <h2 className="writing-title">🎫 이번 주 일정</h2>
      <ul className="market-list">
        {items.map((l, i) => (
          <li key={`${l.postId}-${i}`}>
            {l.dday !== null && <span className="badge badge-dday">{ddayLabel(l.dday)}</span>}
            <Link href={`/posts/${l.postId}`}>{l.name}</Link>
            {l.when && <span className="num">{l.when}</span>}
          </li>
        ))}
      </ul>
      <Link href={`/c/${encodeURIComponent(slug)}?head=${encodeURIComponent("행사")}`} className="hint ad-schedule-all">행사 전체 →</Link>
    </section>
  );
}
