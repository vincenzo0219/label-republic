"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const KEY = "lr:homeSeen";

/** 🔴 로고 옆 새 소식 점 (10/28 대표님): 첫 화면에 새로 생긴 게 있으면 점, 첫 화면을 보면 사라진다 */
export function LogoDot() {
  const pathname = usePathname();
  const [dot, setDot] = useState(false);
  useEffect(() => {
    let since = "";
    try {
      if (pathname === "/") {
        window.localStorage.setItem(KEY, String(Date.now()));
        setDot(false);
        return;
      }
      since = window.localStorage.getItem(KEY) ?? "";
    } catch {
      return;
    }
    let live = true;
    fetch(`/api/home/new${since ? `?since=${encodeURIComponent(since)}` : ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { dot?: boolean } | null) => live && setDot(!!d?.dot))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [pathname]);
  if (!dot) return null;
  return <span className="logo-dot" aria-label="첫 화면에 새 소식" />;
}
