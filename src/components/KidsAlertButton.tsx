"use client";

import { useEffect, useState } from "react";
import { applyHref, programStatus, type KidsProgram } from "@/lib/kidsPrograms";
import { getAlerts, getArea, setAlert, trackOut } from "@/lib/kidsClient";
import { enablePush, pushPublicKey, pushSupported } from "@/lib/pushClient";
import { getPushState } from "@/lib/watchlist";

let keyPromise: Promise<string | null> | null = null;
/** 카드마다 묻지 않게 한 번만 */
export function kidsPushKey(): Promise<string | null> {
  if (!pushSupported()) return Promise.resolve(null);
  keyPromise ??= pushPublicKey();
  return keyPromise;
}

type P = Pick<KidsProgram, "id" | "name" | "applyStartAt" | "applyEndAt" | "applyUrl" | "ibolUrl" | "city">;

/**
 * 🔔 접수 시작 알림 (30분 전·시작). 이미 접수 중이면 신청하기, 마감이면 없음. 푸시를 못 쓰는 브라우저는 숨긴다
 * (아이폰 안내는 목록 위 한 줄).
 */
export function KidsAlertButton({ program, bellOnly = false }: { program: P; bellOnly?: boolean }) {
  const [status, setStatus] = useState<ReturnType<typeof programStatus> | undefined>(undefined);
  const [key, setKey] = useState<string | null | undefined>(undefined);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setStatus(programStatus(program));
    setOn(getAlerts().includes(program.id));
    void kidsPushKey().then(setKey);
  }, [program]);

  if (status === undefined) return null;
  const href = applyHref(program);
  if (status?.key === "open") {
    if (!href || bellOnly) return null;
    return (
      <a className="btn btn-sm kids-apply" href={href} target="_blank" rel="noopener" onClick={() => trackOut(program, program.applyUrl ? "apply" : "ibol")}>
        신청하기
      </a>
    );
  }
  if (status?.key !== "soon" || !key) return null;

  const toggle = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (!on && (!getPushState() || Notification.permission !== "granted")) {
        const r = await enablePush(key);
        if (r !== "on") return setMsg("브라우저 설정에서 알림을 허용해 주세요.");
      }
      const s = getPushState();
      if (!s) return;
      const res = await fetch("/api/push/kids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: s.endpoint, token: s.token, programId: program.id, area: getArea() ?? program.city ?? "", on: !on }),
      });
      if (!res.ok) throw new Error();
      setAlert(program.id, !on);
      setOn(!on);
    } catch {
      setMsg("알림을 켜지 못했어요.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className={`btn btn-sm kids-bell${on ? " on" : ""}`} onClick={toggle} disabled={busy} aria-pressed={on} aria-label={on ? "신청 알림 끄기" : "신청 시작 알림 받기"}>
        {on ? "🔔 켜짐" : bellOnly ? "🔔 신청 시작 알림" : "🔔"}
      </button>
      {msg && <span className="hint kids-msg">{msg}</span>}
    </>
  );
}
