"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import type { ReadingLine } from "@/lib/repo/books";

const METOO_KEY = "lr:metoo";

/**
 * 📖 지금 읽는 책 한 줄 (Sprint 82). 독서 단톡방 메시지 8만여 개를 세어 보니 "저는…" 같은 자기 이야기와
 * "읽고 있어요"가 반응이 가장 잘 붙었다. 제목 + 한마디만 받고, 읽어 본 사람은 버튼 한 번으로 "나도 읽었어요".
 */
export function ReadingNow({ limit = 8 }: { limit?: number }) {
  const [lines, setLines] = useState<ReadingLine[] | null>(null);
  const [form, setForm] = useState({ title: "", line: "", nickname: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<Set<string>>(new Set());

  useEffect(() => {
    api<{ lines: ReadingLine[] }>("/api/books/lines", "GET").then((d) => setLines(d.lines), () => setLines([]));
    try {
      setForm((f) => ({ ...f, nickname: window.localStorage.getItem("lr:nickname") ?? "" }));
      setMine(new Set(JSON.parse(window.localStorage.getItem(METOO_KEY) ?? "[]") as string[]));
    } catch {}
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const d = await api<{ lines: ReadingLine[] }>("/api/books/lines", "POST", { ...form, title: form.title.trim(), line: form.line.trim(), nickname: form.nickname.trim() });
      setLines(d.lines);
      setForm((f) => ({ ...f, title: "", line: "" }));
      try {
        window.localStorage.setItem("lr:nickname", form.nickname.trim());
      } catch {}
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const meToo = async (l: ReadingLine) => {
    if (mine.has(l.book_id)) return;
    const nickname = form.nickname.trim();
    if (nickname.length < 2) return setError("닉네임을 먼저 적어 주세요 (위 칸).");
    const next = new Set(mine).add(l.book_id);
    setMine(next);
    try {
      window.localStorage.setItem(METOO_KEY, JSON.stringify([...next].slice(-300)));
      window.localStorage.setItem("lr:nickname", nickname);
    } catch {}
    try {
      const { readers } = await api<{ readers: number }>(`/api/books/${l.book_id}/metoo`, "POST", { nickname });
      setLines((cur) => cur?.map((x) => (x.book_id === l.book_id ? { ...x, readers } : x)) ?? cur);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <section className="reading-now" aria-label="지금 읽는 책">
      <form onSubmit={submit} className="reading-now-form">
        <b>📖 지금 읽는 책, 한 줄로</b>
        <input className="input" placeholder="책 제목" value={form.title} maxLength={80} required onChange={(e) => setForm({ ...form, title: e.target.value })} aria-label="책 제목" />
        <input className="input" placeholder="한마디 (예: 출근길에 조금씩 읽는 중)" value={form.line} maxLength={120} required onChange={(e) => setForm({ ...form, line: e.target.value })} aria-label="한마디" />
        <div className="row">
          <input className="input" placeholder="닉네임" value={form.nickname} maxLength={20} required onChange={(e) => setForm({ ...form, nickname: e.target.value })} aria-label="닉네임" />
          <button className="btn btn-primary" disabled={busy || form.nickname.trim().length < 2}>
            {busy ? "남기는 중…" : "남기기"}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </form>
      {lines && lines.length > 0 && (
        <ul className="reading-now-list">
          {lines.slice(0, limit).map((l) => (
            <li key={l.id}>
              <p>
                <Link href={`/books/${l.book_id}`}>『{l.title}』</Link> <b>{l.nickname}</b> — {l.line}
              </p>
              <button type="button" className={`btn btn-sm${mine.has(l.book_id) ? " btn-primary" : ""}`} onClick={() => meToo(l)} aria-pressed={mine.has(l.book_id)}>
                📖 나도 읽었어요 {l.readers > 1 ? l.readers - 1 : ""}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
