"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { markSeen, readSeenAll, seenBefore } from "@/lib/seen";

function useSeenBefore(room: string): number | null | undefined {
  const [v, setV] = useState<number | null | undefined>(undefined); // undefined = 아직 모름(서버 렌더)
  useEffect(() => setV(seenBefore(room)), [room]);
  return v;
}

/** 지난번 이후 올라온 글의 카드에 붙는 "NEW" */
export function NewBadge({ room, createdAt }: { room: string; createdAt: string }) {
  const since = useSeenBefore(room);
  if (!since || new Date(createdAt).getTime() <= since) return null;
  return <span className="badge badge-new">NEW</span>;
}

/** 최신순에서 새 글과 이미 본 글의 경계 */
export function NewDivider({ room, newer, older }: { room: string; newer: string; older: string }) {
  const since = useSeenBefore(room);
  if (!since || new Date(newer).getTime() <= since || new Date(older).getTime() > since) return null;
  return (
    <div className="new-divider" role="separator">
      <span>여기까지 지난번에 본 글이에요</span>
    </div>
  );
}

/** 방(또는 홈)을 본 것으로 기록 — 들어오기 전 시각을 먼저 고정한 뒤 지금 시각으로 */
export function MarkSeen({ room }: { room: string }) {
  useEffect(() => {
    seenBefore(room);
    markSeen(room);
  }, [room]);
  return null;
}

// ---------------------------------------------------------------------------
// 방 탭의 "새 글 N" — 한 번 요청해 모든 탭이 같이 쓴다
// ---------------------------------------------------------------------------
let counts: Record<string, number> = {};
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function NewCountsLoader({ active }: { active?: string }) {
  useEffect(() => {
    const seen = readSeenAll();
    const pairs = Object.entries(seen).filter(([room]) => room !== "all" && room !== active);
    if (!pairs.length) return;
    const ctrl = new AbortController();
    const q = pairs.map(([room, at]) => `${encodeURIComponent(room)}:${at}`).join(",");
    fetch(`/api/rooms/new-counts?s=${q}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { counts?: Record<string, number> } | null) => {
        if (!d?.counts) return;
        counts = d.counts;
        listeners.forEach((l) => l());
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [active]);
  return null;
}

export function TabNewCount({ slug }: { slug: string }) {
  const n = useSyncExternalStore(subscribe, () => counts[slug] ?? 0, () => 0);
  if (!n) return null;
  return (
    <span className="tab-count" aria-label={`새 글 ${n}개`}>
      {n > 99 ? "99+" : n}
    </span>
  );
}
