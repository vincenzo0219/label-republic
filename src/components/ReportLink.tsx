"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getInterests, getSeenAt, onInterestsChange } from "@/lib/interests";

/** 헤더의 "내 리포트" 링크 + 새 글 개수 배지 */
export function ReportLink() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      const boards = getInterests();
      if (!boards.length) return setCount(0);
      const qs = new URLSearchParams({ boards: boards.join(","), count: "1", ...(getSeenAt() ? { since: getSeenAt()! } : {}) });
      fetch(`/api/report?${qs}`)
        .then((r) => (r.ok ? r.json() : { total: 0 }))
        .then((d: { total: number }) => !cancelled && setCount(d.total))
        .catch(() => {});
    };
    load();
    const off = onInterestsChange(load);
    return () => {
      cancelled = true;
      off();
    };
  }, []);
  return (
    <Link href="/me" className="report-link" aria-label={count ? `내 리포트, 새 글 ${count}개` : "내 리포트"}>
      <span aria-hidden>📬</span>
      {count > 0 && <span className="report-badge" aria-hidden>{count > 99 ? "99+" : count}</span>}
    </Link>
  );
}
