"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";

/**
 * 승인 대기함의 초안 한 장 (Sprint 51). 고치고 [승인]만 누르면 노방장 글·답글은 바로 올라간다.
 * 스레드·인스타는 서버에 토큰이 있으면(auto) 승인할 때 바로 올라가고(Sprint 52), 없으면 [복사]해서 앱에 붙여넣은 뒤 [올렸음]을 누른다.
 */
export function DraftCard({
  id,
  kind,
  title,
  body,
  extra,
  imageUrl = "",
  auto = false,
  lastError = "",
}: {
  id: string;
  kind: "post" | "comment" | "threads" | "instagram";
  title: string;
  body: string;
  extra: string;
  imageUrl?: string;
  auto?: boolean;
  lastError?: string;
}) {
  const router = useRouter();
  const [t, setT] = useState(title);
  const [b, setB] = useState(body);
  const [msg, setMsg] = useState<string | null>(lastError ? `지난번 실패: ${lastError}` : null);
  const [busy, setBusy] = useState(false);
  const external = kind === "threads" || kind === "instagram";

  async function act(action: "approve" | "discard", manual = false) {
    if (action === "discard" && !confirm("이 초안을 버릴까요?")) return;
    setBusy(true);
    setMsg(action === "approve" && external && !manual ? "올리는 중… (최대 30초)" : null);
    try {
      await api("/api/admin/drafts", "POST", action === "approve" ? { action, id, title: t, body: b, manual } : { action, id });
      router.refresh();
    } catch (err) {
      setMsg((err as Error).message);
      setBusy(false);
    }
  }
  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMsg(`${label} 복사했어요`);
    } catch {
      setMsg("복사가 막혀 있어요 — 글을 길게 눌러 직접 복사해 주세요");
    }
  }

  return (
    <div className="draft-card">
      {kind === "post" && (
        <input className="input" maxLength={120} aria-label={`#${id} 제목`} value={t} onChange={(e) => setT(e.target.value)} />
      )}
      <textarea className="input draft-body" rows={Math.min(14, Math.max(4, b.split("\n").length + 1))} aria-label={`#${id} 본문`} value={b} onChange={(e) => setB(e.target.value)} />
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- 운영자 화면 미리보기, 최적화 불필요
        <img src={imageUrl} alt="함께 올릴 이미지" className="draft-image" />
      )}
      {extra && (
        <p className="hint draft-extra">
          {external ? "첫 댓글·함께 쓸 것: " : "참고: "}
          <span>{extra}</span>
        </p>
      )}
      <div className="draft-actions">
        {external && auto ? (
          <>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => act("approve")} disabled={busy}>
              ✅ 승인하고 {kind === "threads" ? "스레드에" : "인스타에"} 올리기
            </button>
            <button type="button" className="btn btn-sm" onClick={() => act("approve", true)} disabled={busy}>
              직접 올렸음
            </button>
          </>
        ) : external ? (
          <>
            <button type="button" className="btn btn-sm" onClick={() => copy(b, "본문")} disabled={busy}>
              📋 본문 복사
            </button>
            {extra && (
              <button type="button" className="btn btn-sm" onClick={() => copy(extra, "첫 댓글")} disabled={busy}>
                📋 첫 댓글 복사
              </button>
            )}
            <button type="button" className="btn btn-primary btn-sm" onClick={() => act("approve", true)} disabled={busy}>
              ✅ 올렸음
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => act("approve")} disabled={busy}>
            ✅ 승인하고 올리기
          </button>
        )}
        <button type="button" className="btn btn-sm" onClick={() => act("discard")} disabled={busy}>
          버리기
        </button>
        {msg && (
          <span className="hint" role="status">
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}
