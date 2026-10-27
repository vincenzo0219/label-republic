"use client";

import { useEffect, useState } from "react";
import { isAndroidAppReferrer } from "@/lib/appMode";
import { getMyRooms, MY_ROOMS_EVENT } from "@/lib/myRooms";
import { isIosApp, nativeBridge, pushPublicKey } from "@/lib/pushClient";
import { enableRoomAlerts, roomAlertsOn } from "@/lib/roomAlerts";

const KEY = "nb:iosPushAsked";

/**
 * iOS 앱 첫 알림 안내 (10/27). 앱이 스스로 6초 뒤 권한을 묻는 대신, 내 방이 생긴 뒤 한 줄로 묻고
 * "알림 받기"를 누르면 iOS 권한 창 → 내 방 새 글 알림까지 한 번에 켠다. 앱 밖(브라우저)에서는 아무것도 하지 않는다.
 * 이미 iOS 권한을 준 기기(예전 빌드의 자동 권한 요청)는 묻지 않고 조용히 내 방 알림을 맞춘다.
 */
export function IosAppPush() {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // 안드로이드 앱(TWA) 첫 화면: 서버가 못 붙였을 때를 대비해 앱 모드 쿠키 (appMode)
    try {
      if (isAndroidAppReferrer(document.referrer) && !/(?:^|;\s*)nb_app=1/.test(document.cookie)) document.cookie = "nb_app=1; path=/; samesite=lax; secure";
    } catch {}
    if (!isIosApp()) return;
    (window as unknown as { nobangjangNativeAutoPrompt?: boolean }).nobangjangNativeAutoPrompt = false;
    let asked = false;
    try {
      asked = !!window.localStorage.getItem(KEY);
    } catch {}
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    const check = () => {
      if (cancelled || running || roomAlertsOn() || !getMyRooms().length) return;
      running = true;
      void (async () => {
        // 서버에 앱 알림 키가 없으면(준비 중) 묻지 않는다: 권한만 받고 알림이 안 오면 안 되니까
        const key = await pushPublicKey();
        const native = key ? await nativeBridge() : null;
        if (!key || !native || cancelled) return;
        const st = await native.pushStatus().catch(() => null);
        if (st?.permission === "granted") {
          await enableRoomAlerts(key).catch(() => {});
          return;
        }
        if (!asked && st?.permission !== "denied") timer = setTimeout(() => !cancelled && setAsk(true), 2500);
      })().finally(() => (running = false));
    };
    check();
    window.addEventListener(MY_ROOMS_EVENT, check);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener(MY_ROOMS_EVENT, check);
    };
  }, []);

  if (!ask) return null;
  const done = () => {
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {}
    setAsk(false);
  };
  const enable = async () => {
    setBusy(true);
    const key = await pushPublicKey();
    if (key) await enableRoomAlerts(key).catch(() => {});
    setBusy(false);
    done();
  };
  return (
    <div className="inapp-tip" role="dialog" aria-label="알림 받기">
      <span>🔔 내 방 새 글·답글을 알림으로 받을까요?</span>
      <button type="button" disabled={busy} onClick={enable} style={{ background: "#1f5f4a", color: "#fff", borderRadius: 8, padding: "6px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>
        알림 받기
      </button>
      <button type="button" onClick={done} aria-label="나중에">✕</button>
    </div>
  );
}
