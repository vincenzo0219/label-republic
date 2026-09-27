import type { Meetup } from "@/lib/types";

export function formatMeetAt(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
}

export function meetupState(m: Meetup, now = Date.now()): { label: string; tone: "open" | "confirmed" | "closed" } {
  const past = new Date(m.meet_at).getTime() <= now;
  if (m.status === "expired" || (past && m.status !== "confirmed")) return { label: "모집 종료", tone: "closed" };
  if (m.status === "confirmed") return { label: past ? "지난 정모" : "확정", tone: past ? "closed" : "confirmed" };
  return { label: "모집 중", tone: "open" };
}

/** 카드용 한 줄 배지: 📅 확정 · 10월 3일 (금) 오후 07:00 · 5/8명 */
export function MeetupBadge({ meetup }: { meetup: Meetup }) {
  const st = meetupState(meetup);
  return (
    <span className={`badge badge-meetup ${st.tone}`} suppressHydrationWarning>
      📅 {st.label} · {formatMeetAt(meetup.meet_at)} · {meetup.rsvp_count}/{meetup.capacity}명
    </span>
  );
}
