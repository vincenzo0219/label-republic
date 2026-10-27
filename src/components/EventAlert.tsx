"use client";

import { useEffect, useState } from "react";
import { enablePush, pushGranted, pushPublicKey, pushSupported } from "@/lib/pushClient";
import { getPushState } from "@/lib/watchlist";
import { KAKAO_ADD_URL } from "./FollowLinks";

const KEY = "lr:eventRooms";
const readRooms = (): string[] => {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};

/**
 * 🎫 행사 탭: 이 방에 새 행사가 올라오면 알림 (10/21). 푸시를 못 쓰는 브라우저(인스타 앱 안 등)는 카톡 채널로.
 */
export function EventAlert({ slug }: { slug: string }) {
  const [key, setKey] = useState<string | null | undefined>(undefined);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      setOn(pushGranted() && !!getPushState() && readRooms().includes(slug));
    } catch {}
    if (!pushSupported()) return setKey(null);
    void pushPublicKey().then(setKey);
  }, [slug]);

  if (key === undefined) return null;
  if (key === null)
    return (
      <a className="btn event-alert kakao" href={KAKAO_ADD_URL} target="_blank" rel="noopener">
        💬 카톡 채널 추가하고 행사 소식 받기
      </a>
    );

  const toggle = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (!on && (!getPushState() || !pushGranted())) {
        const r = await enablePush(key);
        if (r !== "on") {
          setMsg("브라우저 설정에서 알림을 허용해 주세요.");
          return;
        }
      }
      const s = getPushState();
      if (!s) return;
      const res = await fetch("/api/push/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: s.endpoint, token: s.token, slug, on: !on }),
      });
      if (!res.ok) throw new Error();
      const rooms = readRooms().filter((r) => r !== slug);
      try {
        window.localStorage.setItem(KEY, JSON.stringify(on ? rooms : [...rooms, slug]));
      } catch {}
      setOn(!on);
    } catch {
      setMsg("알림을 켜지 못했어요.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className={`btn event-alert${on ? " on" : ""}`} onClick={toggle} disabled={busy} aria-pressed={on}>
        {on ? "🔔 새 행사 알림 켜짐 · 끄기" : "🔔 새 행사 올라오면 알림 받기"}
      </button>
      {msg && <p className="hint">{msg}</p>}
    </>
  );
}
