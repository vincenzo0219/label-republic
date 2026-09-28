"use client";

import { useEffect, useState } from "react";
import { askWorker, offlineSupported, savedPages, type SavedPage } from "@/lib/offline";

function fmt(ms: number) {
  return new Date(ms).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function OfflineList() {
  const [pages, setPages] = useState<SavedPage[] | null>(null);
  const [online, setOnline] = useState(true);
  const [missed, setMissed] = useState<string | null>(null);
  // 서버 렌더와 첫 화면이 같아야 하므로 브라우저 기능 확인은 마운트 뒤에
  const [supported, setSupported] = useState<boolean | null>(null);
  const load = () => void savedPages().then(setPages);

  useEffect(() => {
    setOnline(navigator.onLine);
    setSupported(offlineSupported());
    // 저장되지 않은 글을 오프라인에서 열면 서비스 워커가 ?from=주소 로 보낸다
    const from = new URLSearchParams(window.location.search).get("from");
    if (from?.startsWith("/")) setMissed(from);
    load();
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);

  if (supported === false) return <p className="notice">이 브라우저는 오프라인 저장을 지원하지 않아요.</p>;
  if (supported === null || pages === null) return <p className="hint">불러오는 중…</p>;
  return (
    <>
      {missed && (
        <p className="notice" role="status">
          연결이 없어 <code>{missed}</code> 을(를) 열지 못했어요. 이 기기에 저장되지 않은 화면이에요.
        </p>
      )}
      {!online && <p className="notice">지금은 오프라인이에요. 아래 글은 저장된 때의 내용이에요.</p>}
      {pages.length === 0 ? (
        <div className="empty">
          <p>아직 저장한 글이 없어요. 글을 읽으면 최근 글이 자동으로 저장되고, 글 화면의 &ldquo;📥 오프라인 저장&rdquo;으로 오래 남길 수 있어요.</p>
        </div>
      ) : (
        <>
          <ul className="watch-list">
            {pages.map((p) => (
              <li key={p.path}>
                <div className="watch-row">
                  <a className="watch-title" href={p.path}>
                    {p.pinned ? "📥 " : ""}
                    {p.title}
                  </a>
                  {p.pinned && (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={async () => {
                        await askWorker({ type: "unpin", url: p.path });
                        load();
                      }}
                      aria-label={`${p.title} 저장 해제`}
                    >
                      해제
                    </button>
                  )}
                </div>
                <span className="hint">
                  {p.pinned ? "저장함" : "최근 본 글"} · {fmt(p.savedAt)}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={async () => {
              if (!window.confirm("이 기기에 저장된 글과 사진을 모두 지울까요?")) return;
              await askWorker({ type: "clear" });
              load();
            }}
          >
            저장한 글 모두 지우기
          </button>
        </>
      )}
    </>
  );
}
