"use client";

import { useEffect, useRef, useState } from "react";
import { REACTION_TRIES } from "@/lib/miniGames";
import { buzz } from "../MiniGame";

type Phase = "ready" | "wait" | "go" | "early" | "shown";

/** ⚡ 반응속도 결투: 1.5~4초 기다렸다 초록이 되면 바로 탭. 5번 중 가장 빠른 기록 */
export function ReactionGame({ onFinish }: { onFinish: (ms: number) => void }) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [tries, setTries] = useState<number[]>([]);
  const [last, setLast] = useState<number | null>(null);
  const goAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function arm() {
    setPhase("wait");
    timer.current = setTimeout(() => {
      goAt.current = performance.now();
      setPhase("go");
    }, 1500 + Math.random() * 2500);
  }

  function tap() {
    if (phase === "ready" || phase === "early" || phase === "shown") return arm();
    if (phase === "wait") {
      if (timer.current) clearTimeout(timer.current);
      buzz(40);
      return setPhase("early");
    }
    const ms = Math.max(1, Math.round(performance.now() - goAt.current));
    buzz();
    const next = [...tries, ms];
    setTries(next);
    setLast(ms);
    if (next.length >= REACTION_TRIES) return onFinish(Math.max(80, Math.min(2000, Math.min(...next))));
    setPhase("shown");
  }

  const label =
    phase === "ready" ? "탭해서 시작" :
    phase === "wait" ? "초록이 되면 탭!" :
    phase === "go" ? "지금!" :
    phase === "early" ? "너무 빨라요! 탭해서 다시" :
    `${((last ?? 0) / 1000).toFixed(3)}초 · 탭해서 다음`;
  return (
    <>
      <button type="button" className={`rx-pad rx-${phase}`} onPointerDown={tap} aria-live="polite">
        <span className="rx-label">{label}</span>
      </button>
      <p className="mg-sub">
        {tries.length}/{REACTION_TRIES}
        {tries.length > 0 && ` · 가장 빠름 ${(Math.min(...tries) / 1000).toFixed(3)}초`}
      </p>
    </>
  );
}
