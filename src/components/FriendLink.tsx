"use client";

import { useEffect, useState } from "react";

/** 공유 창(navigator.share)을 열고, 없거나 막히면 클립보드에 복사. 결과: shared · copied · failed */
export async function shareLink(text: string, url: string): Promise<"shared" | "copied" | "failed"> {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ text, url });
      return "shared";
    } catch (e) {
      // 사용자가 공유 창을 닫은 것이면 복사하지 않는다
      if ((e as Error)?.name === "AbortError") return "failed";
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    return "copied";
  } catch {
    return "failed";
  }
}

/**
 * 🤝 친구에게 링크 보내기 버튼 (11/2). 대결·궁합 링크 공용.
 * makeUrl 은 누를 때 만든다 (닉네임·팀처럼 화면에서 바뀌는 값을 그때 읽으려고).
 */
export function FriendLink({ label, text, makeUrl, className = "btn btn-primary", click }: { label: string; text: string; makeUrl: () => string; className?: string; click?: string }) {
  const [state, setState] = useState<"" | "shared" | "copied" | "failed">("");
  return (
    <div className="friend-link">
      <button
        type="button"
        className={className}
        data-click={click}
        onClick={async () => setState(await shareLink(text, makeUrl()))}
      >
        {label}
      </button>
      {state === "copied" && <p className="hint">링크를 복사했어요. 친구에게 붙여 넣어 보내 주세요.</p>}
      {state === "shared" && <p className="hint">보냈어요. 친구가 끝내면 결과가 나란히 나와요.</p>}
    </div>
  );
}

/** 주소창 쿼리를 한 번 읽어 친구 값 꺼내기 (서버 렌더에서는 null) */
export function useFromQuery<T>(decode: (q: URLSearchParams) => T | null): T | null {
  const [v, setV] = useState<T | null>(null);
  useEffect(() => {
    setV(decode(new URLSearchParams(window.location.search)));
    // decode 는 모듈 수준 함수만 넘긴다
  }, []);
  return v;
}

/** 💞 궁합 카드: 친구 타입 × 내 타입, 궁합 %, 한 줄 */
export function MateCard({ kicker, friend, me, pct, line, note }: { kicker: string; friend: string; me: string; pct: number; line: string; note?: string }) {
  return (
    <div className="mate-card" aria-live="polite">
      <p className="mate-kicker">{kicker}</p>
      <p className="mate-pct">{pct}%</p>
      <div className="vs-sides">
        <span>
          친구<b>{friend}</b>
        </span>
        <span className="vs-x">×</span>
        <span>
          나<b>{me}</b>
        </span>
      </div>
      <p className="mate-line">{line}</p>
      {note && <p className="mate-line">{note}</p>}
      <p className="hint">재미로 정한 궁합표예요. 성향 조합마다 정해진 값이 나와요.</p>
    </div>
  );
}
