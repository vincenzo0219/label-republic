import { kstDay } from "@/lib/metrics";
import { totalVisitorsUntil } from "@/lib/repo/metrics";

// 누적 숫자는 어제까지로 센다 — 날짜가 바뀔 때만 다시 센다 (모든 페이지 머리글이라 요청마다 세지 않게)
const g = globalThis as unknown as { __lrTotalVisitors?: { day: string; n: number } };

/** 머리글 오른쪽: 노방장에 온 누적 방문자 수 (11/7 대표님 "어제 방문자 대신 누적 방문자", 고유 방문자) */
export async function YesterdayVisitors() {
  const day = kstDay(new Date(Date.now() - 86_400_000));
  if (g.__lrTotalVisitors?.day !== day) {
    const n = await totalVisitorsUntil(day).catch(() => null);
    if (n == null) return null;
    g.__lrTotalVisitors = { day, n };
  }
  return (
    <span className="yesterday" aria-label={`누적 방문자 ${g.__lrTotalVisitors.n}명`}>
      누적
      <b>{g.__lrTotalVisitors.n.toLocaleString()}명</b>
    </span>
  );
}
