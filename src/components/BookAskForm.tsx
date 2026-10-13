"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";

/** 상황 열기 — 같은 상황이 이미 있으면 그리로 간다 (Sprint 63) */
export function BookAskForm() {
  const router = useRouter();
  const [situation, setSituation] = useState("");
  const [detail, setDetail] = useState("");
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
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
      const { id } = await api<{ id: string }>("/api/book-asks", "POST", { situation, detail, nickname });
      try {
        window.localStorage.setItem("lr:nickname", nickname);
      } catch {}
      router.push(`/books/ask/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <form className="book-add" onSubmit={submit}>
      <b>🙋 이런 상황에 읽을 책을 찾고 있어요</b>
      <input className="input" placeholder="예: 마음이 불안할 때 읽을 책" value={situation} maxLength={80} required onChange={(e) => setSituation(e.target.value)} aria-label="상황" />
      <textarea className="textarea short" placeholder="덧붙이고 싶은 말 (선택) — 좋아하는 장르, 분량 등" value={detail} maxLength={300} onChange={(e) => setDetail(e.target.value)} aria-label="덧붙이는 말" />
      <input className="input" placeholder="닉네임" value={nickname} maxLength={20} required onChange={(e) => setNickname(e.target.value)} aria-label="닉네임" />
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primary" disabled={busy || situation.trim().length < 4 || nickname.trim().length < 2}>
        {busy ? "여는 중…" : "추천받기"}
      </button>
    </form>
  );
}
