"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BOOK_STATUS_LABEL, BOOK_STATUSES, type BookRead, type BookStatus } from "@/lib/books";
import { api } from "@/lib/client-api";

/** 내 기록 — 읽는 중·완독·중도 포기, 진도, 한 줄, 다음 책 (Sprint 62). 같은 기기에서 다시 남기면 고쳐진다. */
export function BookRecordForm({ bookId, title, mine }: { bookId: string; title: string; mine: BookRead | null }) {
  const router = useRouter();
  const [status, setStatus] = useState<BookStatus | null>(mine?.status ?? null);
  const [progress, setProgress] = useState(mine?.progress ?? 50);
  const [line, setLine] = useState(mine?.line ?? "");
  const [nextTitle, setNextTitle] = useState(mine?.next_title ?? "");
  const [edition, setEdition] = useState(mine?.edition ?? "");
  const [nickname, setNickname] = useState(mine?.nickname ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (mine) return;
    try {
      const n = window.localStorage.getItem("lr:nickname");
      if (n) setNickname(n);
    } catch {}
  }, [mine]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!status) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/books/${bookId}/read`, "POST", { status, progress, line, nextTitle, nickname, edition });
      try {
        window.localStorage.setItem("lr:nickname", nickname);
      } catch {}
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    const url = `${window.location.origin}/books/${bookId}?from=share`;
    const text = `『${title}』 끝까지 읽을 만해요? 읽은 사람들 기록 보기 📖`;
    try {
      if (navigator.share) await navigator.share({ title, text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setCopied(true);
      }
    } catch {}
  };

  return (
    <form id="record" className="book-form" onSubmit={submit}>
      <h2>{mine ? "내 기록 고치기" : "나도 기록 남기기"}</h2>
      <div className="book-status" role="radiogroup" aria-label="읽은 상태">
        {BOOK_STATUSES.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={status === s} className={`book-status-btn${status === s ? " on" : ""}`} onClick={() => setStatus(s)}>
            <span aria-hidden>{BOOK_STATUS_LABEL[s].emoji}</span> {BOOK_STATUS_LABEL[s].label}
          </button>
        ))}
      </div>
      {status && status !== "done" && (
        <label className="book-progress">
          {status === "dropped" ? "어디쯤에서 멈췄어요?" : "지금 어디쯤이에요?"} <b>{progress}%</b>
          <input type="range" min={0} max={100} step={5} value={progress} onChange={(e) => setProgress(Number(e.target.value))} />
        </label>
      )}
      {status && (
        <>
          <textarea className="textarea short" maxLength={200} placeholder={status === "dropped" ? "왜 멈췄는지 한 줄 (선택)" : "한 줄 느낌 (선택)"} value={line} onChange={(e) => setLine(e.target.value)} aria-label="한 줄" />
          <input className="input" maxLength={40} placeholder="어느 출판사(번역)로 읽었어요? (선택) 예: 민음사" value={edition} onChange={(e) => setEdition(e.target.value)} aria-label="출판사·번역" />
          <input className="input" maxLength={80} placeholder="이 책 다음에 읽은(읽을) 책 (선택)" value={nextTitle} onChange={(e) => setNextTitle(e.target.value)} aria-label="다음 책" />
          <input className="input" maxLength={20} placeholder="닉네임" required value={nickname} onChange={(e) => setNickname(e.target.value)} aria-label="닉네임" />
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary" disabled={busy || nickname.trim().length < 2}>
            {busy ? "남기는 중…" : mine ? "고치기" : "기록 남기기"}
          </button>
          <p className="hint">가입 없이, 이 기기에서 다시 남기면 내 기록이 고쳐져요.</p>
        </>
      )}
      {saved && !error && <p className="hint" role="status">✅ 남겼어요! 이 책 읽은 친구에게도 물어봐 주세요 👇</p>}
      <button type="button" className="btn" onClick={share}>
        {copied ? "✅ 링크 복사했어요" : "🔗 이 책 카드 공유하기"}
      </button>
    </form>
  );
}
