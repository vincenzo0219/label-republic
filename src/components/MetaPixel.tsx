"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { META_PIXEL_ID } from "@/lib/metaPixel";
import { isIosApp } from "@/lib/pushClient";

type Fbq = ((...args: unknown[]) => void) & { queue?: unknown[][]; loaded?: boolean; version?: string; callMethod?: (...a: unknown[]) => void };

/**
 * 스토어 앱(iOS 앱·안드로이드 TWA) 안에서는 픽셀을 켜지 않는다 (10/27). 앱 안 광고 추적은 애플 ATT 권한 창이 필요하고,
 * 스토어 개인정보 답변을 "추적 없음"으로 두기 위해. 안드로이드 앱은 첫 화면의 referrer 로만 알 수 있어 이 탭 동안 기억한다.
 */
function inStoreApp(): boolean {
  try {
    if (isIosApp() || /(?:^|;\s*)nb_app=1/.test(document.cookie)) return true;
    if (document.referrer.startsWith("android-app://com.nobangjang.app")) sessionStorage.setItem("nb:twa", "1");
    return sessionStorage.getItem("nb:twa") === "1";
  } catch {
    return false;
  }
}

/** 메타 픽셀 — 페이지 조회만 보낸다 (재방문 광고 대상 만들기). META_PIXEL_ID 가 비어 있으면 아무것도 안 한다 */
export function MetaPixel() {
  const pathname = usePathname();
  useEffect(() => {
    if (!META_PIXEL_ID || inStoreApp()) return;
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
