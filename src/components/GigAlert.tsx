"use client";

import { useEffect, useState } from "react";
import { CLASS_TYPES, regionLabel } from "@/lib/instructorRoom";
import { KIDS_IOS_HINT } from "@/lib/kidsPrograms";
import { isIos } from "@/lib/kidsClient";
import { enablePush, pushPublicKey, pushSupported } from "@/lib/pushClient";
import { getPushState } from "@/lib/watchlist";

type Alert = { areas: string[]; classes: string[] };

async function call(body: Record<string, unknown>): Promise<Alert | null> {
  const s = getPushState();
  if (!s) return null;
  const res = await fetch("/api/push/gigs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: s.endpoint, token: s.token, ...body }) });
  if (!res.ok) throw new Error();
  return ((await res.json()) as { alert: Alert | null }).alert;
}

/** 🔔 대강·구인 지역 알림: 고른 지역(최대 5곳)·수업에 새 글이 올라오면 푸시 */
export function GigAlert({ sido, sigungu }: { sido: string; sigungu: string }) {
  const [key, setKey] = useState<string | null | undefined>(undefined);
  const [alert, setAlert] = useState<Alert | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (!pushSupported()) {
      setIos(isIos());
      return setKey(null);
    }
    void pushPublicKey().then(setKey);
    if (getPushState()) call({}).then(setAlert).catch(() => {});
  }, []);

  if (key === undefined) return null;
  if (key === null) return ios ? <p className="hint kids-ios">{KIDS_IOS_HINT}</p> : null;
  const area = regionLabel(sido, sigungu);
  const on = !!alert?.areas.length;
  const has = !!area && !!alert?.areas.includes(area);

  const save = async (areas: string[], classes: string[]) => {
    setBusy(true);
    setMsg(null);
    try {
      if (!getPushState() || Notification.permission !== "granted") {
        const r = await enablePush(key);
        if (r !== "on") return setMsg("브라우저 설정에서 알림을 허용해 주세요.");
      }
      setAlert(await call({ areas, classes }));
    } catch {
      setMsg("알림을 켜지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gig-alert">
      {area && !has && (
        <button type="button" className="btn btn-sm" disabled={busy || (alert?.areas.length ?? 0) >= 5} onClick={() => save([...(alert?.areas ?? []), area], alert?.classes ?? [])}>
          🔔 {area} 새 글 알림 받기
        </button>
      )}
      {on && (
        <div className="chips gig-alert-on">
          <span className="hint">🔔 알림</span>
          {alert!.areas.map((a) => (
            <button key={a} type="button" className="chip chip-sm" aria-pressed="true" disabled={busy} onClick={() => save(alert!.areas.filter((x) => x !== a), alert!.classes)} aria-label={`${a} 알림 끄기`}>
              {a} ✕
            </button>
          ))}
        </div>
      )}
      {on && (
        <div className="chips gig-alert-on">
          <span className="hint">수업</span>
          {CLASS_TYPES.map((c) => {
            const picked = alert!.classes.includes(c);
            return (
              <button key={c} type="button" className="chip chip-sm" aria-pressed={picked} disabled={busy} onClick={() => save(alert!.areas, picked ? alert!.classes.filter((x) => x !== c) : [...alert!.classes, c])}>
                {c}
              </button>
            );
          })}
        </div>
      )}
      {on && <p className="hint">수업을 안 고르면 전부 · 밤 10시~아침 8시는 모았다가 보내요</p>}
      {msg && <p className="hint">{msg}</p>}
    </div>
  );
}
