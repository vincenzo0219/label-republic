"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { softTap, sparkle } from "@/lib/gameSound";

type Card = { day: string; options: [string, string]; mine: 0 | 1 | null; counts: [number, number] | null; type: string | null };

const pct = (x: number, n: number) => (n ? Math.round((x / n) * 100) : 0);

/** 📖 어느 문장이 더 끌려요? (11/2 대표님 "오른쪽처럼 바로 문장을 선택할 수 있게"). 만남 행사 목록 사이에 끼는 카드 */
export function SentencePick({ from = "singles" }: { from?: string }) {
  const [card, setCard] = useState<Card | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Card>("/api/sentence-pick", "GET").then(setCard).catch(() => {});
  }, []);
  if (!card) return null;

  const pick = async (choice: 0 | 1) => {
    if (card.mine !== null) return;
    softTap();
    try {
      navigator.vibrate?.(15);
    } catch {}
    try {
      setCard(await api<Card>("/api/sentence-pick", "POST", { choice }));
      setTimeout(sparkle, 120);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const n = card.counts ? card.counts[0] + card.counts[1] : 0;
  return (
    <section className="sentence-pick" aria-label="어느 문장이 더 끌려요?">
      <b className="sentence-pick-title">📖 어느 문장이 더 끌려요?</b>
      {card.options.map((o, i) => (
        <button
          key={o}
          type="button"
          className={`sentence-pick-opt${card.mine === i ? " on" : ""}${card.mine !== null && card.mine !== i ? " off" : ""}`}
          aria-pressed={card.mine === i}
          onClick={() => void pick(i as 0 | 1)}
        >
          “{o}”
          {card.counts && <span className="sentence-pick-pct">{pct(card.counts[i]!, n)}%</span>}
        </button>
      ))}
      {card.mine === null ? (
        <p className="hint">고르면 나와 같은 사람이 몇 %인지 보여요 · 매일 새 문장</p>
      ) : (
        <p className="hint">
          {n}명 중 {card.counts![card.mine]}명이 같은 선택{card.type ? ` · ${card.type} 문장` : ""} ·{" "}
          <Link href={`/t/book-sentence?from=${from}`}>12문장으로 내 유형 보기 →</Link>
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
