import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { FeedbackLink } from "@/components/FeedbackLink";
import { Suspense } from "react";
import { Analytics } from "@/components/Analytics";
import { ErrorReporter } from "@/components/ErrorReporter";
import { ReadOnlyWatcher } from "@/components/ReadOnlyWatcher";
import { ReportLink } from "@/components/ReportLink";
import { ServiceWorker } from "@/components/ServiceWorker";
import { config } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(config.siteUrl),
  title: { default: "라벨공화국 — 방장 없는 성분 팩트체크 커뮤니티", template: "%s | 라벨공화국" },
  description:
    "노방장 커뮤니티 라벨공화국. 영양제·사료 성분표부터 키보드 스위치, 데스크테리어, 향수·오디오까지 — 완장질 없이 집단지성으로 검증하는 성분/취미 정보 아카이브.",
  applicationName: "라벨공화국",
  // iPhone 홈 화면에 추가했을 때 앱처럼 (푸시 알림도 이 경우에만 받을 수 있다)
  appleWebApp: { capable: true, title: "라벨공화국", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  openGraph: { siteName: "라벨공화국", type: "website", locale: "ko_KR" },
  alternates: { canonical: "/", types: { "application/atom+xml": [{ url: "/feed.xml", title: "라벨공화국 새 글" }] } },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#141412" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <a className="skip-link" href="#main">본문으로 건너뛰기</a>
        <Suspense fallback={null}>
          <Analytics />
          <ErrorReporter />
        </Suspense>
        <ServiceWorker disabled={process.env.SW_DISABLED === "1"} />
        <ReadOnlyWatcher />
        <header className="site-header">
          <div className="container">
            <Link href="/" className="logo" aria-label="라벨공화국 홈">
              라벨공화국<small>노방장</small>
            </Link>
            <form action="/search" method="get" role="search" aria-label="사이트 검색" className="header-search">
              <input type="search" name="q" placeholder="성분, 제품, 스위치 검색" aria-label="검색어" maxLength={100} />
            </form>
            <ReportLink />
            <Link href="/write" className="btn btn-primary">
              글쓰기
            </Link>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          <div className="container">{children}</div>
        </main>
        <footer className="site-footer">
          <div className="container">
            <p>
              라벨공화국은 방장이 없습니다. 추천/비추천과 신고 자동 블라인드로 모두가 함께 정화하고, 그 기준도 <Link href="/rules">이용자 투표</Link>로 정합니다.
              <br />
              원하는 보드가 없나요? <Link href="/boards">보드 개설 요청</Link> · 사이트가 이상하거나 불편하면 <FeedbackLink />
            </p>
            <p>성분·스펙 정보는 사용자 제보이며 의학적 조언이 아닙니다.</p>
            <nav className="footer-links" aria-label="정책">
              <Link href="/policy">운영 원칙</Link>
              <Link href="/rules">커뮤니티 규칙</Link>
              <Link href="/transparency">투명성 기록</Link>
              <Link href="/terms">이용약관</Link>
              <Link href="/privacy">
                <b>개인정보처리방침</b>
              </Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
