import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { FollowLinks } from "@/components/FollowLinks";
import { YesterdayVisitors } from "@/components/YesterdayVisitors";
import { FeedbackLink } from "@/components/FeedbackLink";
import { Suspense } from "react";
import { Analytics } from "@/components/Analytics";
import { DwellTracker } from "@/components/DwellTracker";
import { ErrorReporter } from "@/components/ErrorReporter";
import { ReadOnlyWatcher } from "@/components/ReadOnlyWatcher";
import { IosAppPush } from "@/components/IosAppPush";
import { InAppBrowserTip } from "@/components/InAppBrowserTip";
import { MetaPixel } from "@/components/MetaPixel";
import { NavCounter } from "@/components/MyRooms";
import { ReportLink } from "@/components/ReportLink";
import { LogoDot } from "@/components/LogoDot";
import { ServiceWorker } from "@/components/ServiceWorker";
import { config } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(config.siteUrl),
  title: { default: "노방장: 같은 취향끼리 일정·정보·수다", template: "%s | 노방장" },
  description:
    "노방장: 같은 취향끼리 일정·정보·수다. 가입 없이 쓰고, 행사·발매 일정은 폰 달력으로 챙기고, 러닝·커피·게임·육아·뮤지컬 등 관심사별 방에서 같은 취향끼리 이야기해요.",
  applicationName: "노방장",
  // iPhone 홈 화면에 추가했을 때 앱처럼 (푸시 알림도 이 경우에만 받을 수 있다)
  appleWebApp: { capable: true, title: "노방장", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  openGraph: { siteName: "노방장", type: "website", locale: "ko_KR" },
  alternates: { canonical: "/", types: { "application/atom+xml": [{ url: "/feed.xml", title: "노방장 새 글" }] } },
  // 검색엔진 소유 확인 (Sprint 44) — 네이버 서치어드바이저·구글 서치 콘솔의 "HTML 태그" 방식 값만 .env 에 넣으면 된다
  verification: {
    ...(process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : {}),
    ...(process.env.NAVER_SITE_VERIFICATION ? { other: { "naver-site-verification": process.env.NAVER_SITE_VERIFICATION } } : {}),
  },
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
          <DwellTracker />
          <MetaPixel />
          <ErrorReporter />
        </Suspense>
        <ServiceWorker disabled={process.env.SW_DISABLED === "1"} />
        <ReadOnlyWatcher />
        <InAppBrowserTip />
        <IosAppPush />
        <header className="site-header">
          <div className="container">
            <Link href="/" className="logo" aria-label="노방장 홈">
              노방장
              <LogoDot />
            </Link>
            <form action="/search" method="get" role="search" aria-label="사이트 검색" className="header-search">
              <input type="search" name="q" placeholder="검색" aria-label="검색어" maxLength={100} />
            </form>
            <Link href="/chat" className="report-link" aria-label="전체 수다방">
              💬
            </Link>
            <ReportLink />
            <Link href="/my" className="report-link" aria-label="마이페이지">
              👤
            </Link>
            <Suspense fallback={null}>
              <YesterdayVisitors />
            </Suspense>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          <div className="container">{children}</div>
        </main>
        <footer className="site-footer">
          <div className="container">
            <p>
              <Link href="/boards">방 만들기</Link> · <FeedbackLink /> · <FollowLinks />
            </p>
            <nav className="footer-links" aria-label="정책">
              <Link href="/support">고객센터</Link>
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
        {/* 지나온 경로 기록 (홈 → 내 방 이동은 바깥에서 온 첫 화면에서만) */}
        <NavCounter />
      </body>
    </html>
  );
}
