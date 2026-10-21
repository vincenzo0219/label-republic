"use client";

import { useEffect, useState } from "react";

const KEY = "lr:inappTipClosed";
/** 인스타·페이스북·카톡·네이버 앱 안 브라우저 */
export const IN_APP = /Instagram|FBAN|FBAV|KAKAOTALK|NAVER\(inapp|Line\//i;

/**
 * 앱 안 브라우저 안내 (10/21 재방문). 방문의 82%가 인스타 광고 → 인스타 앱 안 브라우저라
 * 알림을 못 켜고, 다음에 크롬·사파리로 오면 새 사람처럼 처음부터 시작한다. 한 줄로 바깥 브라우저를 권한다.
 */
export function InAppBrowserTip() {
  const [href, setHref] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const ua = navigator.userAgent;
    try {
      if (!IN_APP.test(ua) || window.localStorage.getItem(KEY)) return;
    } catch {
      return;
    }
    const url = window.location.href;
    // 카톡은 바깥 브라우저로 여는 주소가 있고, 안드로이드는 크롬으로 바로 열 수 있다. 아이폰 인스타는 메뉴로 안내만
    if (/KAKAOTALK/i.test(ua)) setHref(`kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`);
    else if (/Android/i.test(ua)) setHref(`intent://${url.replace(/^https?:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;end`);
    else setHref(null);
  }, []);
  if (href === undefined) return null;
  const close = () => {
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {}
    setHref(undefined);
  };
  return (
    <div className="inapp-tip" role="note">
      {href ? (
        <a href={href}>🔔 알림·기록이 남게 <b>{/KAKAOTALK/i.test(navigator.userAgent) ? "브라우저" : "크롬"}로 열기</b></a>
      ) : (
        <span>🔔 알림·기록이 남게 오른쪽 위 <b>···</b> → <b>외부 브라우저로 열기</b></span>
      )}
      <button type="button" onClick={close} aria-label="닫기">✕</button>
    </div>
  );
}
