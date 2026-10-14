"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, requestKeyFor } from "@/lib/client-api";
import { addMyComment, watchPost } from "@/lib/watchlist";

/**
 * 테스트 결과 화면에서 바로 인증 댓글 남기기 (Sprint 64).
 * 결과 → 인증 글로 넘어가는 단계에서 거의 다 빠져서, 닉네임과 한 줄만 받아 그 자리에서 인증 글에 댓글을 단다.
 * 지울 때 쓰는 비번 4자리는 자동으로 정해 보여 준다 (입력칸을 하나 줄이려고).
 */
export function QuickBrag({ postId, line, bragApi, placeholder, prompt }: { postId: string; line: string; bragApi: string; placeholder: string; prompt: string }) {
  const [nickname, setNickname] = useState("");
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; pin: string } | null>(null);
  const sending = useRef<{ key: string; sent: string } | undefined>(undefined);
  const pin = useRef(String(Math.floor(1000 + Math.random() * 9000)));

  useEffect(() => {
    try {
      setNickname(window.localStorage.getItem("lr:nickname") ?? "");
    } catch {}
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = { nickname: nickname.trim(), pw: pin.current, body: `${line}${extra.trim() || "-"}` };
    try {
      const { comment, notifyRef } = await api<{ comment: { id: string | number }; notifyRef?: string }>(`/api/posts/${postId}/comments`, "POST", payload, {
        idempotencyKey: requestKeyFor(sending, payload),
      });
      sending.current = undefined;
      try {
        window.localStorage.setItem("lr:nickname", payload.nickname);
      } catch {}
      watchPost(postId);
      if (notifyRef) addMyComment(notifyRef);
      fetch(bragApi, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", keepalive: true }).catch(() => {});
      setDone({ id: String(comment.id), pin: pin.current });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <div className="quick-brag done" role="status">
        <p>
          ✅ 남겼어요! 지울 때 비번은 <b>{done.pin}</b>이에요.
        </p>
        <Link href={`/posts/${postId}#c${done.id}`} className="btn btn-primary ear-brag">
          👀 다른 사람들 결과 보러 가기
        </Link>
      </div>
    );

  return (
    <form className="quick-brag" onSubmit={submit}>
      <b>{prompt}</b>
      <p className="quick-brag-line">{line}</p>
      <input className="input" placeholder={placeholder} value={extra} maxLength={120} onChange={(e) => setExtra(e.target.value)} aria-label="한 줄 덧붙이기" />
      <div className="row">
        <input className="input" placeholder="닉네임" value={nickname} maxLength={20} required onChange={(e) => setNickname(e.target.value)} aria-label="닉네임" />
        <button className="btn btn-primary" disabled={busy || nickname.trim().length < 2}>
          {busy ? "남기는 중…" : "결과 남기기"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <p className="hint">가입 없음 · 다른 사람들 결과와 나란히 올라가요 ·{" "}
        <Link href={`/posts/${postId}`}>먼저 구경하기</Link>
      </p>
    </form>
  );
}
