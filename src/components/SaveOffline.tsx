"use client";

import { useEffect, useState } from "react";
import { askWorker, offlineSupported, savedPages } from "@/lib/offline";

/** 글 화면의 "📥 오프라인 저장" — 연결이 없어도 이 기기에서 30일 동안 볼 수 있게 */
export function SaveOffline({ postId }: { postId: string }) {
  const path = `/posts/${postId}`;
  // 운영 빌드에서는 처음부터 비활성 버튼 자리를 잡아 둔다 (확인 뒤 나타나며 버튼 줄을 밀지 않게). 지원하지 않는 브라우저면 확인 뒤 숨김
  const [state, setState] = useState<"hidden" | "pending" | "off" | "on" | "busy">(process.env.NODE_ENV === "production" ? "pending" : "hidden");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!offlineSupported() || process.env.NODE_ENV !== "production") return setState("hidden");
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
      <button type="button" className="btn btn-sm" aria-pressed={state === "on"} disabled={state === "busy" || state === "pending"} onClick={toggle}>
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
