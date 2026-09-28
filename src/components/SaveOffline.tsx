"use client";

import { useEffect, useState } from "react";
import { askWorker, offlineSupported, savedPages } from "@/lib/offline";

/** 글 화면의 "📥 오프라인 저장" — 연결이 없어도 이 기기에서 30일 동안 볼 수 있게 */
export function SaveOffline({ postId }: { postId: string }) {
  const path = `/posts/${postId}`;
  const [state, setState] = useState<"hidden" | "off" | "on" | "busy">("hidden");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!offlineSupported() || process.env.NODE_ENV !== "production") return;
    void savedPages().then((pages) => setState(pages.some((p) => p.path === path && p.pinned) ? "on" : "off"));
  }, [path]);

  if (state === "hidden") return null;
  const toggle = async () => {
    const was = state;
    setState("busy");
    setMsg(null);
    try {
      if (was === "on") {
        await askWorker({ type: "unpin", url: path });
        setState("off");
      } else {
        const r = await askWorker<{ ok: boolean; pinned?: boolean }>({ type: "pin", url: path });
        if (!r.ok) throw new Error("이 글은 저장할 수 없어요.");
        setState("on");
        setMsg("이 기기에 저장했어요. 연결이 없어도 30일 동안 볼 수 있어요.");
      }
    } catch (e) {
      setState(was);
      setMsg((e as Error).message);
    }
  };
  return (
    <>
      <button type="button" className="btn btn-sm" aria-pressed={state === "on"} disabled={state === "busy"} onClick={toggle}>
        {state === "on" ? "📥 저장됨" : "📥 오프라인 저장"}
      </button>
      {msg && (
        <span className="hint" role="status">
          {msg}
        </span>
      )}
    </>
  );
}
