"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** 넣어둬를 마지막으로 연 때 (NeoBoard 가 적는다) */
export const NEO_SEEN_KEY = "lr:neoSeen";

export function markNeoSeen() {
  try {
    window.localStorage.setItem(NEO_SEEN_KEY, String(Date.now()));
  } catch {}
}

/** 홈 💳 넣어둬 버튼 + 마지막으로 본 뒤 새로 올라온 고민 수 (10/28 대표님) */
export function NeoChip() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let since = "";
    try {
      since = window.localStorage.getItem(NEO_SEEN_KEY) ?? "";
    } catch {}
    fetch(`/api/neo/new${since ? `?since=${encodeURIComponent(since)}` : ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { count?: number } | null) => setCount(d?.count ?? 0))
      .catch(() => {});
  }, []);
  return (
    <Link href="/neo" aria-label={count ? `넣어둬, 새 고민 ${count}개` : undefined}>
      💳 넣어둬
      {count > 0 && (
        <span className="neo-new" aria-hidden>
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
