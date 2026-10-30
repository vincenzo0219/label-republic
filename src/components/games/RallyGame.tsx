"use client";

import { useEffect, useRef, useState } from "react";
import { chime, pong, thud } from "@/lib/gameSound";
import { burst, floatText, pointOf, shake, VIBE, vibe } from "@/lib/juice";

/** 치는 칸 (공 위치 0 = 맞은편, 1 = 내 앞) */
const ZONE: [number, number] = [0.74, 0.93];
const LANE_X = [26, 74];
const START_SPEED = 0.6;
const MAX_SPEED = 2.2;

type Phase = "ready" | "play" | "miss";

/** 🎾 랠리 탭: 공이 오는 쪽(왼쪽·오른쪽 절반)을 치는 칸에서 탭. 받을수록 빨라지고, 놓치면 끝 */
export function RallyGame({ onFinish }: { onFinish: (hits: number) => void }) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [, setTick] = useState(0);
  const [flash, setFlash] = useState<number | null>(null);
  const s = useRef({ y: 0, lane: 0, dir: "in" as "in" | "out", speed: START_SPEED, hits: 0, side: 0, last: 0, stopUntil: 0 });
  const raf = useRef(0);
  const court = useRef<HTMLDivElement>(null);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  function end() {
    cancelAnimationFrame(raf.current);
    thud();
    vibe(VIBE.bad);
    shake(court.current, true);
    setPhase("miss");
    const hits = s.current.hits;
    setTimeout(() => onFinish(hits), 800);
  }

  function loop(t: number) {
    const st = s.current;
    // 맞는 순간 아주 잠깐 멈춤(히트스톱) → 탁 하고 받아친 느낌
    if (t < st.stopUntil) {
      st.last = t;
      raf.current = requestAnimationFrame(loop);
      return;
    }
    const dt = Math.min(0.05, (t - st.last) / 1000);
    st.last = t;
    if (st.dir === "in") {
      st.y += st.speed * dt;
      if (st.y > 1) return end();
    } else {
      st.y -= 2.8 * dt;
      if (st.y <= 0) {
        st.y = 0;
        st.dir = "in";
        st.lane = Math.random() < 0.5 ? 0 : 1;
      }
    }
    setTick((x) => x + 1);
    raf.current = requestAnimationFrame(loop);
  }

  function start() {
    s.current = { y: 0, lane: Math.random() < 0.5 ? 0 : 1, dir: "in", speed: START_SPEED, hits: 0, side: 0, last: performance.now(), stopUntil: 0 };
    setPhase("play");
    raf.current = requestAnimationFrame(loop);
  }

  function tap(e: React.PointerEvent<HTMLDivElement>) {
    if (phase === "ready") return start();
    if (phase !== "play") return;
    const st = s.current;
    const rect = court.current!.getBoundingClientRect();
    const side = e.clientX - rect.left < rect.width / 2 ? 0 : 1;
    st.side = side;
    if (st.dir !== "in" || st.y < 0.5) return; // 아직 멀다: 무시
    if (st.y >= ZONE[0] && st.y <= ZONE[1] && side === st.lane) {
      st.hits += 1;
      st.speed = Math.min(MAX_SPEED, st.speed * 1.07);
      st.dir = "out";
      st.stopUntil = performance.now() + 70;
      const { x, y } = pointOf(e);
      pong(st.hits);
      const streak = st.hits % 5 === 0;
      if (streak) setTimeout(chime, 80);
      vibe(streak ? VIBE.big : VIBE.hit);
      shake(court.current, streak);
      burst(x, y, streak ? 14 : 9, ["#c6f432", "#ffffff", "#ffd84d"]);
      floatText(x, y - 24, streak ? `${st.hits}연속!` : "+1");
      setFlash(st.hits);
      return;
    }
    end();
  }

  const st = s.current;
  const x = st.dir === "in" ? 50 + (LANE_X[st.lane]! - 50) * st.y : LANE_X[st.side]! + (50 - LANE_X[st.side]!) * (1 - st.y);
  const size = 14 + st.y * 16;
  return (
    <>
      <p className="mg-sub">{st.hits}번 이어 받기</p>
      <div ref={court} className={`rally-court rally-${phase}`} onPointerDown={tap} role="button" tabIndex={0} aria-label="공이 오는 쪽을 탭">
        <span className="rally-net" aria-hidden />
        <span className="rally-mid" aria-hidden />
        <span className="rally-zone" style={{ top: `${ZONE[0] * 100}%`, height: `${(ZONE[1] - ZONE[0]) * 100}%` }} aria-hidden />
        {phase !== "ready" && (
          <span className="rally-ball" style={{ top: `${st.y * 100}%`, left: `${x}%`, width: size, height: size }} aria-hidden />
        )}
        <span className="rally-racket" style={{ left: `${LANE_X[st.side]}%` }} aria-hidden />
        {flash !== null && phase === "play" && st.dir === "out" && <span key={flash} className="rally-pop" aria-hidden>퍽!</span>}
        {phase === "ready" && <span className="rally-msg">공이 오는 쪽을 탭<br />탭해서 시작</span>}
        {phase === "miss" && <span className="rally-msg">놓쳤어요!</span>}
      </div>
    </>
  );
}
