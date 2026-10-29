"use client";

import { useState } from "react";

/** 🛠 /admin 신고·자동 가림 줄의 가리기 / 다시 보이기 (10/29). 같은 출처 요청이라 브라우저의 관리자 인증이 함께 간다 */
export function AdminHideButton({ type, id, hidden }: { type: string; id: string; hidden: boolean }) {
  const [isHidden, setHidden] = useState(hidden);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const act = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/hide", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, id, action: isHidden ? "restore" : "hide", note: isHidden ? "운영자 확인: 문제없음" : "운영자 확인: 신고·점검" }),
      });
      const d = (await res.json().catch(() => ({}))) as { hidden?: boolean; error?: { message?: string } };
      if (!res.ok) throw new Error(d.error?.message ?? `실패 (${res.status})`);
      setHidden(!!d.hidden);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className="btn btn-sm" disabled={busy} onClick={act}>
        {isHidden ? "다시 보이기" : "가리기"}
      </button>
      {err && <span className="hint"> {err}</span>}
    </>
  );
}
