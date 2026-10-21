"use client";

import { useEffect } from "react";

const KEY = "lr:seenPosts";
const MAX = 3000;

function load(): Set<string> {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/** 목록에서 반쯤 보인 글을 모아 한 번에 보낸다 — 글마다 이 브라우저에서 한 번만 (Sprint 96) */
export function SeenTracker() {
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const seen = load();
    const queue = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      timer = undefined;
      const ids = [...queue].slice(0, 30);
      ids.forEach((id) => queue.delete(id));
      if (!ids.length) return;
      fetch("/api/posts/seen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }), keepalive: true }).catch(() => {});
      try {
        window.localStorage.setItem(KEY, JSON.stringify([...seen].slice(-MAX)));
      } catch {}
      if (queue.size) timer = setTimeout(flush, 2000);
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const id = (e.target as HTMLElement).dataset.postId;
          io.unobserve(e.target);
          if (!id || seen.has(id)) continue;
          seen.add(id);
          queue.add(id);
        }
        if (queue.size && !timer) timer = setTimeout(flush, 1500);
      },
      { threshold: 0.5 },
    );
    document.querySelectorAll<HTMLElement>("[data-post-id]").forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, []);
  return null;
}
