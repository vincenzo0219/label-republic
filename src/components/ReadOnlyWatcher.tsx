"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * 읽기 전용 모드 (Sprint 27): 서버가 저장본을 보낼 때 <body data-lr-readonly> 를 붙인다 (globals.css 가 안내 띠를 그림).
 * 이 화면에 머무는 동안 서버 상태를 확인해, 돌아오면 안내를 "돌아왔어요"로 바꾸고 다음 페이지 이동 때 지운다.
 * (자동 새로고침은 하지 않는다 — 쓰던 내용이 사라질 수 있어서)
 */
export function ReadOnlyWatcher() {
  const pathname = usePathname();

  useEffect(() => {
    const body = document.body;
    if (body.dataset.lrRecovered) {
      delete body.dataset.lrReadonly;
      delete body.dataset.lrRecovered;
    }
  }, [pathname]);

  useEffect(() => {
    const body = document.body;
    if (!body.dataset.lrReadonly || body.dataset.lrRecovered) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (!res.ok) return;
        body.dataset.lrReadonly = "✅ 서버가 돌아왔어요 · 새로고침하면 최신 화면을 볼 수 있어요";
        body.dataset.lrRecovered = "1";
        clearInterval(timer);
      } catch {
        /* 아직 */
      }
    }, 15_000);
    return () => clearInterval(timer);
  }, []);

  return null;
}
