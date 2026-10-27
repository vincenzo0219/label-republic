"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { isIos } from "@/lib/kidsClient";
import { enablePush, pushGranted, pushPublicKey, pushSupported } from "@/lib/pushClient";
import { getPushState } from "@/lib/watchlist";

type Res = { on: boolean; result?: string };
const call = (endpoint: string, action: "status" | "on" | "off" | "test") => api<Res>("/api/admin/owner-alert", "POST", { endpoint, action });

/** 🔔 사람 글·댓글 알림 (이 기기, 10/25) — 사람이 글·댓글·대강구인을 쓰면 이 브라우저로 바로 (60초에 한 번, 그 사이는 묶어서) */
export function OwnerAlertCard({ devices }: { devices: number }) {
  const [key, setKey] = useState<string | null | undefined>(undefined);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setIos(isIos());
    if (!pushSupported()) return setKey(null);
    void pushPublicKey().then(setKey);
    const s = getPushState();
    if (s) call(s.endpoint, "status").then((r) => setOn(r.on)).catch(() => {});
  }, []);

  const run = async (action: "on" | "off" | "test") => {
    setBusy(true);
    setMsg(null);
    try {
      if (action === "on" && key && (!getPushState() || !pushGranted())) {
        const r = await enablePush(key);
        if (r !== "on") return setMsg("브라우저 설정에서 이 사이트 알림을 허용해 주세요.");
      }
      const s = getPushState();
      if (!s) return setMsg("먼저 알림을 켜 주세요.");
      const r = await call(s.endpoint, action);
      setOn(r.on);
      setMsg(action === "test" ? (r.result === "sent" ? "테스트 알림을 보냈어요. 몇 초 안에 와요." : "보내지 못했어요. 잠시 뒤 다시 눌러 주세요.") : r.on ? "켜졌어요. 사람이 글·댓글을 쓰면 바로 알려 드려요." : "껐어요.");
    } catch (e) {
      setMsg((e as Error).message || "실패했어요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel" aria-labelledby="owner-alert-h">
      <h2 id="owner-alert-h">🔔 사람 글·댓글 알림 (이 기기)</h2>
      <p className="hint">사람이 글·댓글·대강구인을 쓰면 이 기기로 바로 알려요. 운영 닉네임·AI·승인 대기함 글은 빼고, 1분에 한 번까지(그 사이 글은 묶어서). 켠 기기 {devices}대</p>
      {key === null ? (
        <p className="hint">{ios ? "아이폰은 Safari 공유 버튼 → '홈 화면에 추가' 한 뒤, 홈 화면의 노방장 앱에서 /admin 을 열고 켜 주세요." : "이 브라우저는 푸시 알림을 쓸 수 없어요."}</p>
      ) : (
        <p style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {on ? (
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => run("off")}>
              🔕 이 기기 알림 끄기
            </button>
          ) : (
            <button type="button" className="btn btn-sm btn-primary" disabled={busy || key === undefined} onClick={() => run("on")}>
              🔔 이 기기로 알림 받기
            </button>
          )}
          <button type="button" className="btn btn-sm" disabled={busy || !on} onClick={() => run("test")}>
            테스트 알림
          </button>
        </p>
      )}
      {ios && key !== null && <p className="hint">아이폰은 홈 화면에 추가한 앱에서만 알림이 와요.</p>}
      {msg && <p className="hint" role="status">{msg}</p>}
    </section>
  );
}
