"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * ⏱ 체류시간·스크롤 비콘 (10/29 대표님 "미혼남녀방 체류시간을 알려줘").
 * 페이지마다 한 번: 다른 페이지로 넘어가거나 화면을 떠날 때(탭 전환·앱 닫기) 보이는 동안 머문 시간,
 * 가장 깊이 내려 본 비율, 화면에 들어온 [data-dwell-mark] 표시(예: first-event)를 보낸다. 내용·입력은 보내지 않는다.
 */
export function DwellTracker() {
  const pathname = usePathname();
  useEffect(() => {
    let visibleMs = 0;
    let since = document.visibilityState === "visible" ? Date.now() : 0;
    let maxScroll = 0;
    let sent = false;
    const marks = new Set<string>();

    const depth = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      const pct = h <= 0 ? 100 : Math.round((window.scrollY / h) * 100);
      if (pct > maxScroll) maxScroll = Math.min(100, Math.max(0, pct));
    };
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) marks.add((e.target as HTMLElement).dataset.dwellMark!);
    });
    const watch = () => document.querySelectorAll<HTMLElement>("[data-dwell-mark]").forEach((el) => io.observe(el));
    const mo = new MutationObserver(watch);
    mo.observe(document.body, { childList: true, subtree: true });
    watch();
    depth();

    const send = () => {
      if (sent) return;
      sent = true;
      if (since) visibleMs += Date.now() - since;
      const payload = JSON.stringify({ path: pathname, ms: Math.round(visibleMs), scroll: maxScroll, marks: [...marks].slice(0, 10) });
      try {
        if (!navigator.sendBeacon?.("/api/metrics/dwell", new Blob([payload], { type: "application/json" }))) {
          void fetch("/api/metrics/dwell", { method: "POST", body: payload, keepalive: true, headers: { "Content-Type": "application/json" } });
        }
      } catch {}
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") send();
    };
    window.addEventListener("scroll", depth, { passive: true });
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", send);
    return () => {
      send();
      io.disconnect();
      mo.disconnect();
      window.removeEventListener("scroll", depth);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", send);
    };
  }, [pathname]);
  return null;
}
