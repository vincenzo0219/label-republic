"use client";

import { useEffect, useState } from "react";
import { WORLDCUP_TRAITS } from "@/lib/miniGames";
import { chime, pop, whoosh } from "@/lib/gameSound";
import { burst, pointOf, popEl, VIBE, vibe } from "@/lib/juice";

const ROUND_NAME: Record<number, string> = { 16: "16강", 8: "8강", 4: "4강", 2: "결승" };

function shuffled(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** 💘 이상형 월드컵: 16장 둘씩 골라 결승까지. 우승 카드 번호로 끝낸다 */
export function WorldcupGame({ onFinish }: { onFinish: (winner: number) => void }) {
  const [pool, setPool] = useState<number[]>(() => Array.from({ length: WORLDCUP_TRAITS.length }, (_, k) => k));
  // 섞기는 브라우저에서만 (서버 화면과 어긋나지 않게)
  useEffect(() => setPool(shuffled(WORLDCUP_TRAITS.length)), []);
  const [next, setNext] = useState<number[]>([]);
  const [i, setI] = useState(0);
  const a = pool[i]!;
  const b = pool[i + 1]!;

  function pick(w: number, e: React.MouseEvent<HTMLButtonElement>) {
    const { x, y } = pointOf(e);
    whoosh();
    setTimeout(pop, 60);
    vibe(VIBE.tap);
    popEl(e.currentTarget);
    burst(x, y, 10, ["#ff7eb6", "#ff9fc8", "#ffd1e3", "#c79bff"]);
    const won = [...next, w];
    if (i + 2 < pool.length) {
      setNext(won);
      setI(i + 2);
      return;
    }
    if (won.length === 1) return onFinish(won[0]!);
    // 다음 라운드(8강·4강·결승)로 올라갈 때 딩동
    setTimeout(chime, 150);
    vibe(VIBE.hit);
    setPool(won);
    setNext([]);
    setI(0);
  }

  return (
    <>
      <p className="mg-sub">
        {ROUND_NAME[pool.length]} {pool.length > 2 ? `${i / 2 + 1}/${pool.length / 2}` : ""}
      </p>
      <div className="wc-pair">
        <button type="button" className="wc-card" onClick={(e) => pick(a, e)}>{WORLDCUP_TRAITS[a]}</button>
        <span className="wc-vs" aria-hidden>VS</span>
        <button type="button" className="wc-card" onClick={(e) => pick(b, e)}>{WORLDCUP_TRAITS[b]}</button>
      </div>
    </>
  );
}
