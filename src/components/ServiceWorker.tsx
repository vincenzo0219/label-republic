"use client";

import { useEffect, useState } from "react";

/**
 * 서비스 워커 등록 (운영 빌드만) + 새 버전 안내 + 오프라인 표시 (Sprint 19).
 * 새 버전은 화면을 다시 불러오지 않고 조용히 바꾼다 (쓰던 글이 날아가지 않게).
 */
export function ServiceWorker({ disabled = false }: { disabled?: boolean }) {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    if (disabled && "serviceWorker" in navigator) {
      // 비상 스위치(SW_DISABLED=1): 새로 등록하지 않고, 있던 것은 지운다
      void navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => void r.unregister()));
      if ("caches" in window) void caches.keys().then((keys) => keys.filter((k) => k.startsWith("lr-")).forEach((k) => void caches.delete(k)));
    }
    if (disabled || process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
      return () => {
        window.removeEventListener("online", sync);
        window.removeEventListener("offline", sync);
      };
    }
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // 새 버전은 안내 없이 조용히 바꾼다 (10/25 사용자 "들어올 때마다 새로고침이 뜬다").
        // 화면은 다시 불러오지 않으므로 쓰던 글은 그대로고, 다음 이동부터 새 버전이 쓰인다.
        if (reg.waiting && navigator.serviceWorker.controller) reg.waiting.postMessage({ type: "skipWaiting" });
        reg.addEventListener("updatefound", () => {
          const w = reg.installing;
          w?.addEventListener("statechange", () => {
            if (w.state === "installed" && navigator.serviceWorker.controller) w.postMessage({ type: "skipWaiting" });
          });
        });
      })
      .catch(() => {});
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, [disabled]);

  return (
    <>
      {offline && (
        <div className="net-banner" role="status">
          📴 오프라인이에요. <a href="/offline">저장한 글</a>은 볼 수 있어요.
        </div>
      )}
    </>
  );
}
