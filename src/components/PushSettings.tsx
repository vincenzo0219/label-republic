"use client";

import { useEffect, useState } from "react";
import { onInterestsChange } from "@/lib/interests";
import { enablePush } from "@/lib/pushClient";
import { clearRoomAlertsFlag, scheduleRoomAlertsSync } from "@/lib/roomAlerts";
import { getPushState, setPushState, syncPush } from "@/lib/watchlist";

type Status = "loading" | "unsupported" | "disabled" | "off" | "on" | "blocked";

/**
 * 푸시 알림 켜기/끄기. 켜면 이 브라우저의 푸시 주소와 관심 제품·지켜보는 글·내 댓글 번호가 서버에 저장되고,
 * 끄면 바로 지워진다. 내 방 새 글은 따로 켠 경우에만 (🔔 내 방 새 글 알림 받기, 10/25 · 방마다 6시간에 한 번, 하루 3번까지).
 */
export function PushSettings() {
  const [status, setStatus] = useState<Status>("loading");
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setStatus("unsupported");
      if (Notification.permission === "denied") return setStatus("blocked");
      setStatus(getPushState() ? "on" : "off");
    };
    fetch("/api/push")
      .then((r) => r.json())
      .then((d: { enabled: boolean; publicKey: string | null }) => {
        if (cancelled) return;
        if (!d.enabled) return setStatus("disabled");
        setKey(d.publicKey);
        refresh();
        // 알림을 켠 브라우저면 들어올 때마다 목록을 한 번 맞춘다 (90일 미사용 자동 삭제 기준도 갱신)
        if (getPushState()) {
          void syncPush();
          scheduleRoomAlertsSync();
        }
      })
      .catch(() => !cancelled && setStatus("disabled"));
    const off = onInterestsChange(() => {
      setStatus((s) => (s === "on" || s === "off" ? (getPushState() ? "on" : "off") : s));
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  async function enable() {
    if (!key) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await enablePush(key);
      if (r !== "on") {
        setStatus(r === "denied" ? "blocked" : "off");
        return;
      }
      setStatus("on");
      setMsg("알림을 켰어요. 관심 제품·지켜보는 글·내 댓글에 새 소식이 모이면 한 시간에 한 번까지 알려 드려요.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    const s = getPushState();
    setBusy(true);
    setMsg(null);
    try {
      if (s) {
        await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
      }
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      await (await reg?.pushManager.getSubscription())?.unsubscribe();
      setPushState(null);
      clearRoomAlertsFlag();
      setStatus("off");
      setMsg("알림을 끄고 서버에 있던 알림 정보를 지웠어요.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading" || status === "disabled") return null;
  return (
    <section className="push-settings" aria-labelledby="push-h">
      <h2 id="push-h" className="section-title">📲 푸시 알림</h2>
      {status === "unsupported" && <p className="hint">이 브라우저는 푸시 알림을 지원하지 않아요. iPhone은 홈 화면에 추가한 뒤 열면 쓸 수 있어요.</p>}
      {status === "blocked" && <p className="hint">브라우저 설정에서 이 사이트의 알림이 차단되어 있어요. 설정에서 허용한 뒤 다시 시도하세요.</p>}
      {(status === "off" || status === "on") && (
        <>
          <p className="hint" style={{ marginTop: 0 }}>
            답글·새 소식을 휴대폰 알림으로 받아요.
          </p>
          {status === "off" ? (
            <button type="button" className="btn btn-sm" disabled={busy} onClick={enable}>
              🔔 알림 켜기
            </button>
          ) : (
            <button type="button" className="btn btn-sm" disabled={busy} onClick={disable}>
              🔕 알림 끄기
            </button>
          )}
        </>
      )}
      {msg && (
        <p className="hint" role="status">
          {msg}
        </p>
      )}
    </section>
  );
}
