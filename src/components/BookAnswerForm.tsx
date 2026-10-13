"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";

function useNickname() {
  const [nickname, setNickname] = useState("");
  useEffect(() => {
    try {
      setNickname(window.localStorage.getItem("lr:nickname") ?? "");
    } catch {}
  }, []);
  const remember = (n: string) => {
    try {
      window.localStorage.setItem("lr:nickname", n);
    } catch {}
  };
  return [nickname, setNickname, remember] as const;
}

/** 이 상황에 책 추천하기 (Sprint 63) — 책 카드가 없으면 함께 만들어진다 */
export function BookAnswerForm({ askId, situation }: { askId: string; situation: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [reason, setReason] = useState("");
  const [nickname, setNickname, remember] = useNickname();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/book-asks/${askId}/answers`, "POST", { title, author, reason, nickname });
      remember(nickname);
      setTitle("");
      setAuthor("");
      setReason("");
      setDone(true);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const share = async () => {
    const url = `${window.location.origin}/books/ask/${askId}?from=share`;
    const text = `${situation}, 뭐 읽어요? 추천 좀 남겨 주세요 📚`;
    try {
      if (navigator.share) await navigator.share({ title: situation, text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setCopied(true);
      }
    } catch {}
  };
  return (
    <form id="answer" className="book-form" onSubmit={submit}>
      <h2>📚 이 상황에 추천하기</h2>
      <div className="row">
        <input className="input" placeholder="책 제목" value={title} maxLength={80} required onChange={(e) => setTitle(e.target.value)} aria-label="추천할 책 제목" />
        <input className="input" placeholder="저자 (선택)" value={author} maxLength={40} onChange={(e) => setAuthor(e.target.value)} aria-label="저자" />
      </div>
      <textarea className="textarea short" placeholder="왜 이 상황에 좋은지 한 줄 (선택)" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} aria-label="추천 이유" />
      <input className="input" placeholder="닉네임" value={nickname} maxLength={20} required onChange={(e) => setNickname(e.target.value)} aria-label="닉네임" />
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primary" disabled={busy || !title.trim() || nickname.trim().length < 2}>
        {busy ? "남기는 중…" : "추천 남기기"}
      </button>
      {done && !error && <p className="hint" role="status">✅ 추천했어요! 고마워요.</p>}
      <button type="button" className="btn" onClick={share}>
        {copied ? "✅ 링크 복사했어요" : "🔗 이 질문 공유하기"}
      </button>
    </form>
  );
}

/** "나도 추천" — 이미 올라온 책에 한 표 (이유 없이) */
export function SameBookButton({ askId, title, author }: { askId: string; title: string; author: string }) {
  const router = useRouter();
  const [nickname, setNickname, remember] = useNickname();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/book-asks/${askId}/answers`, "POST", { title, author, reason: "", nickname });
      remember(nickname);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!open)
    return (
      <button type="button" className="btn btn-ghost book-same" onClick={() => (nickname.trim().length >= 2 ? send() : setOpen(true))} disabled={busy}>
        👍 나도 추천
      </button>
    );
  return (
    <div className="row book-same">
      <input className="input" placeholder="닉네임" value={nickname} maxLength={20} onChange={(e) => setNickname(e.target.value)} aria-label="닉네임" />
      <button type="button" className="btn btn-primary" disabled={busy || nickname.trim().length < 2} onClick={send}>
        👍 추천
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
