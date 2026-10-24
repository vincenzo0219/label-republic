"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getInterests, getSeenAt, onInterestsChange } from "@/lib/interests";
import { getMyRooms, onMyRoomsChange } from "@/lib/myRooms";
import { seenParam } from "@/lib/seen";
import { dailyPushSync, getMyComments, getWatchedPosts, getWatchedProducts } from "@/lib/watchlist";

/** 관심 목록·내 댓글의 새 소식 수 (헤더 배지와 홈 알림이 같이 쓴다) */
export function useReportCount(sync = false): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      // 내 방이 있으면 관심 방 중 내 방만 센다
      const mine = getMyRooms();
      const boards = getInterests().filter((b) => !mine.length || mine.includes(b));
      const products = getWatchedProducts();
      const posts = getWatchedPosts();
      const comments = getMyComments();
      if (!boards.length && !products.length && !posts.length && !comments.length) return setCount(0);
      const qs = new URLSearchParams({
        count: "1",
        ...(boards.length ? { boards: boards.join(",") } : {}),
        ...(products.length ? { products: products.join(",") } : {}),
        ...(posts.length ? { posts: posts.join(",") } : {}),
        ...(comments.length ? { comments: comments.join(",") } : {}),
        ...(getSeenAt() ? { since: getSeenAt()! } : {}),
        ...(seenParam(boards) ? { seen: seenParam(boards) } : {}),
      });
      fetch(`/api/report?${qs}`)
        .then((r) => (r.ok ? r.json() : { total: 0 }))
        .then((d: { total: number }) => !cancelled && setCount(d.total))
        .catch(() => {});
    };
    load();
    if (sync) dailyPushSync();
    const off = onInterestsChange(load);
    const offMine = onMyRoomsChange(load);
    return () => {
      cancelled = true;
      off();
      offMine();
    };
  }, [sync]);
  return count;
}

/** 헤더의 "내 리포트" 링크 + 새 글 개수 배지 */
export function ReportLink() {
  const count = useReportCount(true);
  return (
    <Link href="/me" className="report-link" aria-label={count ? `내 리포트, 새 소식 ${count}개` : "내 리포트"}>
      <span aria-hidden>📬</span>
      {count > 0 && <span className="report-badge" aria-hidden>{count > 99 ? "99+" : count}</span>}
    </Link>
  );
}

/** 홈 맨 위: 내 댓글·관심 글에 반응이 왔으면 크게 한 줄 (Sprint 78, 배지만으로는 지나친다) */
export function HomeNews() {
  const count = useReportCount();
  if (!count) return null;
  return (
    <Link href="/me" className="home-news">
      📬 새 소식 {count > 99 ? "99+" : count}개 — 확인하기
    </Link>
  );
}
