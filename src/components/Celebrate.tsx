"use client";

import { useEffect, useState } from "react";
import { cheer, fanfare } from "@/lib/gameSound";
import { reducedMotion, vibe } from "@/lib/juice";

/**
 * 🎉 사람이 어디든 글을 쓰면 화면 전체에 큰 폭죽, 처음 쓰면 "환영해요" (10/30 대표님 "테니스 채팅창에 첫 글을 썼는데 폭죽도 없었다는데,
 * 아주 크게 폭죽이 터지고 환영해요 라는 문구와 함께 화면 전체에", "사람이 어디든 글을 쓰면 큰 폭죽", "처음 쓰면 환영해요").
 * celebrateWrite() 를 부르면 루트 레이아웃의 <Celebrate /> 가 띄운다. 글을 올리고 다른 화면으로 넘어가도 보이게 sessionStorage 로 넘긴다.
 */
const FIRST_KEY = "lr:wroteOnce";
const PENDING_KEY = "lr:celebrate";
const EVENT = "lr:celebrate";
type Kind = "first" | "again";

export function celebrateWrite(): void {
  let kind: Kind = "again";
  try {
    if (!window.localStorage.getItem(FIRST_KEY)) {
      kind = "first";
      window.localStorage.setItem(FIRST_KEY, new Date().toISOString());
    }
    window.sessionStorage.setItem(PENDING_KEY, kind);
  } catch {}
  window.dispatchEvent(new CustomEvent<Kind>(EVENT, { detail: kind }));
}

const COLORS = ["#ff6b5f", "#ffb357", "#ffd84d", "#3ddc97", "#5fd3ff", "#c79bff", "#ff8ad8"];

export function Celebrate() {
  const [show, setShow] = useState<{ kind: Kind; n: number } | null>(null);

  useEffect(() => {
    const open = (kind: Kind) => {
      try {
        window.sessionStorage.removeItem(PENDING_KEY);
      } catch {}
      setShow((s) => ({ kind, n: (s?.n ?? 0) + 1 }));
      vibe(kind === "first" ? [40, 60, 40, 60, 120] : [30, 40, 80]);
      fanfare();
      setTimeout(cheer, 350);
    };
    // 글을 올리고 화면이 바뀐 경우
    try {
      const pending = window.sessionStorage.getItem(PENDING_KEY);
      if (pending === "first" || pending === "again") open(pending);
    } catch {}
    const on = (e: Event) => open((e as CustomEvent<Kind>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => setShow(null), show.kind === "first" ? 3200 : 2200);
    return () => clearTimeout(t);
  }, [show]);

  if (!show) return null;
  const still = reducedMotion();
  const count = still ? 0 : show.kind === "first" ? 120 : 70;
  return (
    <div key={show.n} className={`celebrate${show.kind === "first" ? " first" : ""}`} role="status" aria-live="polite" onClick={() => setShow(null)}>
      <div className="celebrate-bits" aria-hidden>
        {Array.from({ length: count }, (_, i) => (
          <i
            key={i}
            style={{
              left: `${(i * 37 + 11) % 100}%`,
              background: COLORS[i % COLORS.length],
              animationDelay: `${(i % 12) * 45}ms`,
              animationDuration: `${1.4 + (i % 5) * 0.25}s`,
              transform: `rotate(${(i * 47) % 360}deg)`,
            }}
          />
        ))}
      </div>
      <p className="celebrate-text">{show.kind === "first" ? "🎉 환영해요!" : "🎉 고마워요!"}</p>
      {show.kind === "first" && <p className="celebrate-sub">첫 글이 올라갔어요</p>}
    </div>
  );
}
