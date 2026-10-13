"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";

/** 책 카드 만들기 — 같은 책이 이미 있으면 그 카드로 간다 (Sprint 62) */
export function BookAddForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { id } = await api<{ id: string }>("/api/books", "POST", { title, author });
      router.push(`/books/${id}#record`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <form className="book-add" onSubmit={submit}>
      <b>➕ 지금 읽는 책으로 카드 만들기</b>
      <div className="row">
        <input className="input" placeholder="책 제목" value={title} maxLength={80} required onChange={(e) => setTitle(e.target.value)} aria-label="책 제목" />
        <input className="input" placeholder="저자 (선택)" value={author} maxLength={40} onChange={(e) => setAuthor(e.target.value)} aria-label="저자" />
      </div>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primary" disabled={busy || !title.trim()}>
        {busy ? "만드는 중…" : "카드 만들고 기록 남기기"}
      </button>
    </form>
  );
}
