"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { markDailyAction } from "@/lib/streak";
import type { BookBite as Bite } from "@/lib/repo/bookBites";

const KEY = "lr:biteDays";

function streak(days: string[], today: string): number {
  const set = new Set(days);
  let n = 0;
  for (let d = new Date(`${today}T00:00:00Z`); set.has(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() - 1)) n++;
  return n;
}

/** 📖 오늘 책 한입 — 책 덕후방 맨 위 카드 (Sprint 96) */
export function BookBite({ bite }: { bite: Bite }) {
  const [tries, setTries] = useState(bite.tries);
  const [done, setDone] = useState(false);
  const [days, setDays] = useState<string[]>([]);
  useEffect(() => {
    try {
      const d = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as string[];
      setDays(d);
      setDone(d.includes(bite.day));
    } catch {}
  }, [bite.day]);

  async function go() {
    setDone(true);
    const next = [...new Set([...days, bite.day])].slice(-60);
    setDays(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
    // 🔥 연속 기록(오늘의 문제·질문과 같은 기록)도 이어지게 — 저녁 "끊기기 전" 알림의 기준
    markDailyAction();
    try {
      setTries((await api<{ tries: number }>("/api/book-bites/try", "POST", {})).tries);
    } catch {}
  }

  const s = streak(days, bite.day);
  return (
    <section className="book-bite" aria-label="오늘 책 한입">
      <p className="book-bite-k">📖 오늘 책 한입 · 『{bite.book}』 {bite.author}</p>
      <p className="book-bite-q">
        {bite.verbatim ? <>&ldquo;{bite.quote}&rdquo;</> : bite.quote}
        {!bite.verbatim && <span className="book-bite-note"> · 요지</span>}
      </p>
      <p className="book-bite-a">오늘 해 볼 것: {bite.action}</p>
      <div className="book-bite-row">
        <button type="button" className={done ? "btn btn-sm" : "btn btn-primary btn-sm"} disabled={done} onClick={go}>
          {done ? "✅ 오늘 도전" : "✋ 오늘 해 볼게요"}
        </button>
        <span className="hint">
          {tries > 0 && `${tries}명 도전 중`}
          {done && s > 1 && ` · 🔥 ${s}일째`}
          {done && " · 내일 아침 새 한입"}
        </span>
      </div>
    </section>
  );
}
