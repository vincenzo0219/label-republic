"use client";

import { useEffect, useRef, useState } from "react";
import { LATTE_CUPS, LATTE_HALF, latteCupScore, latteHeart } from "@/lib/miniGames";
import { pourStart, pourStop, pourUpdate, softTap, sparkle, splash } from "@/lib/gameSound";
import { burst, floatText, shake, VIBE, vibe } from "@/lib/juice";

type Cup = { center: number; speed: number };
const newCup = (): Cup => ({ center: 55 + Math.random() * 30, speed: 0.85 + Math.random() * 0.3 });
/** 잔 안쪽: 아래 200 → 위 40 */
const yOf = (fill: number) => 200 - (Math.min(fill, 100) / 100) * 160;

/** ☕ 라떼아트 따르기: 누르는 동안 우유가 차고, 목표 띠 안에서 손을 떼면 하트. 5잔 합계 */
export function LatteGame({ onFinish }: { onFinish: (total: number) => void }) {
  const [cup, setCup] = useState<Cup>({ center: 70, speed: 1 });
  const [fill, setFill] = useState(0);
  const [pouring, setPouring] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [scores, setScores] = useState<number[]>([]);
  const fillRef = useRef(0);
  const raf = useRef(0);
  const lastT = useRef(0);
  const stoppedAt = useRef(0);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 목표 띠·속도는 브라우저에서 정한다 (서버 화면과 어긋나지 않게)
    setCup(newCup());
    return () => {
      cancelAnimationFrame(raf.current);
      pourStop();
    };
  }, []);

  function step(t: number) {
    const dt = Math.min(0.05, (t - lastT.current) / 1000);
    lastT.current = t;
    // 처음엔 천천히, 찰수록 빨라진다
    fillRef.current += 38 * cup.speed * dt * (0.55 + fillRef.current / 110);
    if (fillRef.current >= 100) {
      fillRef.current = 100;
      setFill(100);
      return stop();
    }
    setFill(fillRef.current);
    pourUpdate(fillRef.current);
    raf.current = requestAnimationFrame(step);
  }

  function startPour() {
    if (done !== null || pouring) return;
    setPouring(true);
    pourStart();
    vibe(VIBE.tap);
    lastT.current = performance.now();
    raf.current = requestAnimationFrame(step);
  }

  function stop() {
    cancelAnimationFrame(raf.current);
    setPouring(false);
    pourStop();
    stoppedAt.current = performance.now();
    if (fillRef.current <= 0) return;
    const s = latteCupScore(fillRef.current, cup.center);
    const r = stage.current?.getBoundingClientRect();
    const cx = r ? r.left + r.width / 2 : 0;
    const cy = r ? r.top + r.height * (0.2 + (1 - Math.min(fillRef.current, 100) / 100) * 0.6) : 0;
    if (fillRef.current >= 100) {
      // 넘침: 철퍽 + 크게 흔들림
      splash();
      vibe(VIBE.bad);
      shake(stage.current, true);
    } else if (latteHeart(fillRef.current, cup.center)) {
      sparkle();
      vibe(s >= 90 ? VIBE.big : VIBE.hit);
      shake(stage.current);
      burst(cx, cy, s >= 90 ? 14 : 10, ["#fffaf2", "#f6e7d2", "#ff7eb6", "#ffd84d"]);
      floatText(cx, cy - 10, s >= 90 ? "❤️ 완벽!" : `❤️ +${s}`);
    } else {
      softTap();
      floatText(cx, cy - 10, s > 0 ? `+${s}` : "아쉬워요");
    }
    setDone(s);
    setScores((x) => [...x, s]);
  }

  function nextCup() {
    // 손을 뗀 그 탭이 바로 다음 잔으로 넘어가지 않게
    if (performance.now() - stoppedAt.current < 350) return;
    softTap();
    if (scores.length >= LATTE_CUPS) return onFinish(scores.reduce((a, b) => a + b, 0));
    fillRef.current = 0;
    setFill(0);
    setDone(null);
    setCup(newCup());
  }

  const heart = done !== null && latteHeart(fill, cup.center);
  const total = scores.reduce((a, b) => a + b, 0);
  return (
    <>
      <p className="mg-sub">
        {Math.min(scores.length + (done === null ? 1 : 0), LATTE_CUPS)}/{LATTE_CUPS}잔 · {total}점
      </p>
      <div
        ref={stage}
        className={`latte-stage${pouring ? " pouring" : ""}`}
        onPointerDown={done === null ? startPour : undefined}
        onPointerUp={pouring ? stop : undefined}
        onPointerLeave={pouring ? stop : undefined}
        onPointerCancel={pouring ? stop : undefined}
        onClick={done !== null ? nextCup : undefined}
        role="button"
        tabIndex={0}
        aria-label={done === null ? "누르고 있으면 우유가 부어져요" : "다음 잔"}
      >
        <svg viewBox="0 0 220 230" className="latte-svg" aria-hidden>
          <defs>
            <clipPath id="latte-in">
              <path d="M30 40 L190 40 L172 200 Q170 210 160 210 L60 210 Q50 210 48 200 Z" />
            </clipPath>
            <linearGradient id="latte-milk" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f6e7d2" />
              <stop offset="1" stopColor="#c99a6b" />
            </linearGradient>
          </defs>
          {pouring && <rect x="104" y="0" width="12" height={yOf(fill)} rx="6" fill="#f6e7d2" />}
          <g clipPath="url(#latte-in)">
            <rect x="0" y="0" width="220" height="230" fill="#fbf7f2" />
            <rect x="0" y={yOf(fill)} width="220" height="230" fill="url(#latte-milk)" />
            <rect x="0" y={yOf(cup.center + LATTE_HALF)} width="220" height={yOf(cup.center - LATTE_HALF) - yOf(cup.center + LATTE_HALF)} fill="#3ddc97" opacity="0.18" />
          </g>
          <line x1="20" x2="200" y1={yOf(cup.center + LATTE_HALF)} y2={yOf(cup.center + LATTE_HALF)} stroke="#2f6f5e" strokeDasharray="5 5" strokeWidth="2" />
          <line x1="20" x2="200" y1={yOf(cup.center - LATTE_HALF)} y2={yOf(cup.center - LATTE_HALF)} stroke="#2f6f5e" strokeDasharray="5 5" strokeWidth="2" />
          <path d="M30 40 L190 40 L172 200 Q170 210 160 210 L60 210 Q50 210 48 200 Z" fill="none" stroke="#5b4636" strokeWidth="5" strokeLinejoin="round" />
          <path d="M184 80 Q214 84 210 118 Q206 146 176 150" fill="none" stroke="#5b4636" strokeWidth="6" />
          {heart && (
            <path
              className="latte-heart"
              transform={`translate(110 ${yOf(fill) + 22})`}
              d="M0 14 C-22 -2 -14 -18 0 -8 C14 -18 22 -2 0 14 Z"
              fill="#fffaf2"
              stroke="#e8cfae"
              strokeWidth="2"
            />
          )}
        </svg>
        <p className="latte-tip">
          {done === null ? (pouring ? "띠 안에서 손을 떼요" : "꾹 누르고 있으면 부어져요") : `${heart ? "❤️ 하트 완성! " : fill >= 100 ? "넘쳤어요 " : ""}${done}점 · 탭해서 ${scores.length >= LATTE_CUPS ? "결과 보기" : "다음 잔"}`}
        </p>
      </div>
    </>
  );
}
