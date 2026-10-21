"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { META_PIXEL_ID } from "@/lib/metaPixel";

type Fbq = ((...args: unknown[]) => void) & { queue?: unknown[][]; loaded?: boolean; version?: string; callMethod?: (...a: unknown[]) => void };

/** 메타 픽셀 — 페이지 조회만 보낸다 (재방문 광고 대상 만들기). META_PIXEL_ID 가 비어 있으면 아무것도 안 한다 */
export function MetaPixel() {
  const pathname = usePathname();
  useEffect(() => {
    if (!META_PIXEL_ID) return;
    const w = window as unknown as { fbq?: Fbq; _fbq?: Fbq };
    if (!w.fbq) {
      const fbq: Fbq = (...args: unknown[]) => {
        if (fbq.callMethod) fbq.callMethod(...args);
        else fbq.queue!.push(args);
      };
      fbq.queue = [];
      fbq.loaded = true;
      fbq.version = "2.0";
      w.fbq = w._fbq = fbq;
      const s = document.createElement("script");
      s.async = true;
      s.src = "https://connect.facebook.net/en_US/fbevents.js";
      document.head.appendChild(s);
      fbq("init", META_PIXEL_ID);
    }
    w.fbq("track", "PageView");
  }, [pathname]);
  return null;
}
