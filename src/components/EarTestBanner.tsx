import Link from "next/link";

/** 홈 맨 위 — 귀 테스트 두 개로 (Sprint 59·61) */
export function EarTestBanner() {
  return (
    <div className="ear-banners">
      <Link href="/ear-test" className="ear-banner">
        <span className="ear-banner-emoji" aria-hidden>
          🎧
        </span>
        <span>
          <b>황금귀 테스트</b> — 원본과 압축 음원, 들으면 구분될까? <span className="ear-banner-go">1분 테스트 →</span>
        </span>
      </Link>
      <Link href="/hearing-test" className="ear-banner">
        <span className="ear-banner-emoji" aria-hidden>
          🦟
        </span>
        <span>
          <b>고음 청력 테스트</b> — 내 귀는 몇 kHz까지 들릴까? <span className="ear-banner-go">1분 테스트 →</span>
        </span>
      </Link>
    </div>
  );
}
