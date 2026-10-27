"use client";

import { useEffect, useState, type ReactNode } from "react";
import { enablePush, pushGranted, pushPublicKey, pushSupported } from "@/lib/pushClient";
import { getPushState } from "@/lib/watchlist";

/**
 * 알림 켜기 버튼 하나 (Sprint 70·73). daily 를 주면 오늘의 문제 아침 알림도 켠다.
 * 이미 켰으면 onLabel, 푸시를 못 쓰면 fallback(없으면 숨김).
 */
export function PushButton({ label, onLabel, daily, fallback = null }: { label: string; onLabel: string; daily?: boolean; fallback?: ReactNode }) {
  const flag = daily ? "lr:dailyPush" : null;
  const [key, setKey] = useState<string | null | undefined>(undefined);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      const granted = pushGranted() && !!getPushState();
      setOn(granted && (!flag || window.localStorage.getItem(flag) === "1"));
    } catch {}
    if (!pushSupported()) return setKey(null);
    void pushPublicKey().then(setKey);
  }, [flag]);

  if (key === undefined) return null;
  if (key === null) return <>{fallback}</>;
  if (on) return <span className="btn" aria-disabled="true">{onLabel}</span>;
  const enable = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await enablePush(key, daily);
      if (r === "on") {
        setOn(true);
        try {
          if (flag) window.localStorage.setItem(flag, "1");
        } catch {}
      } else if (r === "denied") setMsg("브라우저 설정에서 알림을 허용해 주세요.");
    } catch {
      setMsg("알림을 켜지 못했어요.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className="btn" onClick={enable} disabled={busy}>
        {label}
      </button>
      {msg && <p className="hint">{msg}</p>}
    </>
  );
}
