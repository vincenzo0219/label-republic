"use client";

import { useEffect, useState } from "react";

let updateRequested = false;

/**
 * 서비스 워커 등록 (운영 빌드만) + 새 버전 안내 + 오프라인 표시 (Sprint 19).
 * 새 버전은 바로 바꾸지 않고, 사용자가 "새로고침"을 누를 때 바꾼다 (쓰던 글이 날아가지 않게).
 */
export function ServiceWorker({ disabled = false }: { disabled?: boolean }) {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
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
    let reloading = false;
    // 처음 설치될 때도 controllerchange 가 오므로, 사용자가 "새로고침"을 누른 경우에만 다시 불러온다
    const onController = () => {
      if (reloading || !updateRequested) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // 이미 기다리는 새 버전이 있거나(다른 탭에서 받음), 새로 받으면 안내
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const w = reg.installing;
          w?.addEventListener("statechange", () => {
            if (w.state === "installed" && navigator.serviceWorker.controller) setWaiting(w);
          });
        });
      })
      .catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", onController);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      navigator.serviceWorker.removeEventListener("controllerchange", onController);
    };
  }, [disabled]);

  return (
    <>
      {offline && (
        <div className="net-banner" role="status">
          📴 오프라인이에요. <a href="/offline">저장한 글</a>은 볼 수 있어요.
        </div>
      )}
      {waiting && (
        <div className="update-toast" role="status">
          새 버전이 있어요.
          <button type="button" className="btn btn-sm btn-primary" onClick={() => {
              updateRequested = true;
              waiting.postMessage({ type: "skipWaiting" });
            }}>
            새로고침
          </button>
        </div>
      )}
    </>
  );
}
