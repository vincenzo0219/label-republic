"use client";

import { useEffect, useRef, useState } from "react";

/** 주소에 go=1 이 있으면 (방 카드·놀이 탭에서 한 번 눌러 들어온 경우) 시작 화면을 건너뛴다 (11/5)
 *  countdown 이 참이면 3·2·1 을 보여 준 뒤 시작, 아니면 바로 시작. go=1 이 없으면 아무것도 안 한다. */
export function useAutoGo(ready: boolean, start: () => void, countdown: boolean): number | null {
  const [count, setCount] = useState<number | null>(null);
  const fired = useRef(false);
  const startRef = useRef(start);
  startRef.current = start;

  useEffect(() => {
    if (!ready || fired.current) return;
    if (new URLSearchParams(window.location.search).get("go") !== "1") return;
    fired.current = true;
    if (!countdown) return void startRef.current();
    setCount(3);
    let n = 3;
    const id = window.setInterval(() => {
      n -= 1;
      if (n <= 0) {
        window.clearInterval(id);
        setCount(null);
        startRef.current();
      } else setCount(n);
    }, 800);
    return () => {
      window.clearInterval(id);
      if (n > 0) fired.current = false; // 개발 모드 이중 실행으로 끊긴 경우 다시 센다
    };
  }, [ready, countdown]);

  return count;
}

export function GoCountdown({ n, label }: { n: number; label: string }) {
  return (
    <section className="ear-card go-count" aria-live="assertive">
      <p className="ear-kicker">{label}</p>
      <p className="go-num" key={n}>{n}</p>
      <p className="hint">곧 시작해요</p>
    </section>
  );
}
