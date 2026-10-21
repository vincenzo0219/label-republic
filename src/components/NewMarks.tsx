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

// ---------------------------------------------------------------------------
// 방 안 말머리·정보·정모 옆 숫자 (Sprint 93) — 지난번 이후 새 글, 처음 온 방이면 최근 7일
// ---------------------------------------------------------------------------
let filter: Record<string, number> = {};
const filterListeners = new Set<() => void>();
const subscribeFilter = (fn: () => void) => {
  filterListeners.add(fn);
  return () => filterListeners.delete(fn);
};

export function FilterCountsLoader({ room }: { room: string }) {
  useEffect(() => {
    const since = seenBefore(room);
    const ctrl = new AbortController();
    const q = new URLSearchParams({ slug: room, ...(since ? { since: String(since) } : {}) });
    fetch(`/api/rooms/filter-counts?${q}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { counts?: Record<string, number> } | null) => {
        if (!d?.counts) return;
        filter = d.counts;
        filterListeners.forEach((l) => l());
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [room]);
  return null;
}

export function FilterCount({ k }: { k: string }) {
  const n = useSyncExternalStore(subscribeFilter, () => filter[k] ?? 0, () => 0);
  if (!n) return null;
  return (
    <span className="tab-count" aria-label={`새 글 ${n}개`}>
      {n > 98 ? "99+" : n}
    </span>
  );
}
