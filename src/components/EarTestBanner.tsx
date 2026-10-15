import Link from "next/link";

/** 홈 맨 위 — 오늘의 문제, 귀 테스트 두 개, 첫 문장·타자 테스트, 책 카드로 (Sprint 59·61·62·65·66·67) */
export function EarTestBanner() {
  return (
    <div className="ear-banners">
      <Link href="/daily" className="ear-banner">
        <span className="ear-banner-emoji" aria-hidden>
          📅
        </span>
        <span>
          <b>오늘의 문제</b> — 매일 0시, 첫 문장 한 문제 + 황금귀 한 문제 <span className="ear-banner-go">오늘 문제 풀기 →</span>
        </span>
      </Link>
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
      <Link href="/first-line-test" className="ear-banner">
        <span className="ear-banner-emoji" aria-hidden>
          📜
        </span>
        <span>
          <b>첫 문장 테스트</b> — 첫 문장만 보고 무슨 책인지 알아요? <span className="ear-banner-go">1분 테스트 →</span>
        </span>
      </Link>
      <Link href="/typing-test" className="ear-banner">
        <span className="ear-banner-emoji" aria-hidden>
          ⌨️
        </span>
        <span>
          <b>한글 타자 테스트</b> — 한컴 타자연습 이후 처음 재 보는 내 타수 <span className="ear-banner-go">1분 테스트 →</span>
        </span>
      </Link>
      <Link href="/books" className="ear-banner">
        <span className="ear-banner-emoji" aria-hidden>
          📖
        </span>
        <span>
          <b>책 카드</b> — 이 책, 끝까지 읽을 만해요? 실제 독자 완독률 <span className="ear-banner-go">보러 가기 →</span>
        </span>
      </Link>
    </div>
  );
}
