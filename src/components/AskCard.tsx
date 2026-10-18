"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import type { BookAskSummary } from "@/lib/books";

/**
 * 🙋 사람이 묻는 상황별 추천 (Sprint 82). 양식 대신 "○○님이 물어봐요"로 보여 주고, 답은 그 자리에서 책 제목 한 줄.
 * 독서 단톡방에서 질문·추천 요청은 평균보다 반응이 1.2배 붙었다.
 */
export function AskCard({ ask }: { ask: BookAskSummary }) {
  const [title, setTitle] = useState("");
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setNickname(window.localStorage.getItem("lr:nickname") ?? "");
    } catch {}
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/book-asks/${ask.id}/answers`, "POST", { title: title.trim(), nickname: nickname.trim() });
      setDone(title.trim());
      setTitle("");
      try {
        window.localStorage.setItem("lr:nickname", nickname.trim());
      } catch {}
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="ask-card">
      <p className="hint">🙋 {ask.nickname}님이 물어봐요</p>
      <Link href={`/books/ask/${ask.id}`}>
        <b>{ask.situation}</b>
      </Link>
      {ask.top.length > 0 && <p className="hint">추천 {ask.answers} · {ask.top.map((t) => `『${t}』`).join(" ")}</p>}
      {done ? (
        <p role="status">✅ 『{done}』 추천했어요</p>
      ) : (
        <form onSubmit={submit} className="row">
          <input className="input" placeholder="책 제목 한 권" value={title} maxLength={80} required onChange={(e) => setTitle(e.target.value)} aria-label={`${ask.situation}에 추천할 책 제목`} />
          {!nickname && <input className="input" placeholder="닉네임" maxLength={20} required onChange={(e) => setNickname(e.target.value)} aria-label="닉네임" />}
          <button className="btn btn-primary" disabled={busy || !title.trim() || nickname.trim().length < 2}>
            추천
          </button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </li>
  );
}
