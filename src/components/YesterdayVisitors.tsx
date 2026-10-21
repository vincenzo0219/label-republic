import { kstDay } from "@/lib/metrics";
import { periodVisitors } from "@/lib/repo/metrics";

// 어제 숫자는 하루 동안 안 바뀐다 — 날짜가 바뀔 때만 다시 센다 (모든 페이지 머리글이라 요청마다 세지 않게)
const g = globalThis as unknown as { __lrYesterday?: { day: string; n: number } };

/** 머리글 오른쪽: 어제 노방장에 온 사람 수 (Sprint 96, 고유 방문자) */
export async function YesterdayVisitors() {
  const day = kstDay(new Date(Date.now() - 86_400_000));
  if (g.__lrYesterday?.day !== day) {
    const v = await periodVisitors(day, day).catch(() => null);
    if (!v) return null;
    g.__lrYesterday = { day, n: v.visitors };
  }
  return (
    <span className="yesterday" aria-label={`어제 방문자 ${g.__lrYesterday.n}명`}>
      어제
      <b>{g.__lrYesterday.n.toLocaleString()}명</b>
    </span>
  );
}
