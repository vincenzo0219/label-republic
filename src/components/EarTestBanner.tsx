import Link from "next/link";

/** 홈 맨 위 한 줄 — 황금귀 테스트로 (Sprint 59) */
export function EarTestBanner() {
  return (
    <Link href="/ear-test" className="ear-banner">
      <span className="ear-banner-emoji" aria-hidden>
        🎧
      </span>
      <span>
        <b>황금귀 테스트</b> — 원본과 압축 음원, 들으면 구분될까? <span className="ear-banner-go">1분 테스트 →</span>
      </span>
    </Link>
  );
}
