"use client";

import { useEffect, useState } from "react";
import { BOOK_TASTE_MAX, BOOK_TASTE_MIN_RESPONSES, BOOK_TASTES, type TasteBoard } from "@/lib/bookTaste";
import { api } from "@/lib/client-api";

/**
 * 📚 행사 책 취향 테이블 (11/2 대표님 허락, 💌 미혼남녀 만남 행사 방 🧩 놀이 탭). 다음 만남 행사에서 이야기할 책 취향을 모은다.
 * 정해진 목록에서 최대 3개. 모은 숫자만 보이고, 응답 5명 이상일 때만 TOP 5 와 대화 주제를 연다
 */
export function BookTasteTable() {
  const [board, setBoard] = useState<TasteBoard | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<TasteBoard>("/api/book-taste", "GET")
      .then((b) => {
        setBoard(b);
        setSel(b.mine);
      })
      .catch(() => setErr("불러오지 못했어요. 잠시 뒤 다시 열어 주세요."));
  }, []);
  const toggle = (k: string) => setSel(sel.includes(k) ? sel.filter((x) => x !== k) : sel.length < BOOK_TASTE_MAX ? [...sel, k] : sel);
  const send = async () => {
    setBusy(true);
    setErr("");
    try {
      setBoard(await api<TasteBoard>("/api/book-taste", "POST", { picks: sel }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const voted = !!board?.mine.length;
  return (
    <section className="ear-card tt-test tt-embedded">
      <p className="ear-kicker">📚 행사 책 취향 테이블</p>
      <h2 className="ear-title">다음 만남 행사, 어떤 책 이야기 할까요?</h2>
      <p className="hint">좋아하는 책 취향을 {BOOK_TASTE_MAX}개까지 골라 주세요. 이름·연락처 없이 모은 숫자만 보여요.</p>
      <div className="tt-chips" role="group" aria-label="책 취향 고르기">
        {BOOK_TASTES.map((t) => (
          <button key={t.key} type="button" className="chip" aria-pressed={sel.includes(t.key)} onClick={() => toggle(t.key)} disabled={!sel.includes(t.key) && sel.length >= BOOK_TASTE_MAX}>
            {t.label}
          </button>
        ))}
      </div>
      <button type="button" className="btn btn-primary" disabled={!sel.length || busy} onClick={send}>
        {voted ? "고른 것 바꾸기" : `${sel.length}개 보내기`}
      </button>
      {err && <p className="hint">{err}</p>}
      {board && (
        <div className="tt-taste-board">
          {board.top.length ? (
            <>
              <p className="ear-kicker">지금까지 {board.responses}명 · 책 취향 TOP 5</p>
              <ol className="tt-top">
                {board.top.map((t) => (
                  <li key={t.key}>
                    {t.label} <span className="hint">{t.count}명</span>
                  </li>
                ))}
              </ol>
              <p className="ear-kicker">💬 행사에서 꺼내기 좋은 이야기</p>
              <ul className="tt-topics">
                {board.topics.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="hint">
              지금까지 {board.responses}명이 골랐어요. {BOOK_TASTE_MIN_RESPONSES}명이 모이면 TOP 5와 대화 주제가 열려요.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
