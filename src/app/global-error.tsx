"use client";

/** 루트 레이아웃까지 실패한 경우의 최후 화면 — 전역 CSS가 없을 수 있어 인라인 스타일만 쓴다 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body style={{ fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "64px 16px", background: "#f6f5f1", color: "#1c1b19" }}>
        <h1 style={{ fontSize: 20 }}>라벨공화국</h1>
        <p>서비스에 일시적인 문제가 생겼어요. 잠시 후 다시 시도해 주세요.</p>
        <button onClick={reset} style={{ padding: "10px 18px", borderRadius: 999, border: 0, background: "#1f5f4a", color: "#fff", fontSize: 15 }}>
          다시 시도
        </button>
      </body>
    </html>
  );
}
