"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * 페이지 조회 비콘. 첫 로드는 document.referrer 로 유입 경로를 남기고(landing),
 * 이후 클라이언트 내비게이션은 사이트 내 이동으로 기록한다.
 */
export function Analytics() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const first = useRef(true);

  useEffect(() => {
    const landing = first.current;
    first.current = false;
    const payload = JSON.stringify({
      path: search ? `${pathname}?${search}` : pathname,
      referrer: landing ? document.referrer : undefined,
      landing,
    });
    try {
      if (!navigator.sendBeacon?.("/api/metrics/pageview", new Blob([payload], { type: "application/json" }))) {
        void fetch("/api/metrics/pageview", { method: "POST", body: payload, keepalive: true, headers: { "Content-Type": "application/json" } });
      }
    } catch {}
  }, [pathname, search]);

  return null;
}
