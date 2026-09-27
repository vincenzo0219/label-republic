import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { config } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(config.siteUrl),
  title: { default: "라벨공화국 — 방장 없는 성분 팩트체크 커뮤니티", template: "%s | 라벨공화국" },
  description:
    "노방장 커뮤니티 라벨공화국. 영양제·사료 성분표부터 키보드 스위치, 데스크테리어, 향수·오디오까지 — 완장질 없이 집단지성으로 검증하는 성분/취미 정보 아카이브.",
  applicationName: "라벨공화국",
  openGraph: { siteName: "라벨공화국", type: "website", locale: "ko_KR" },
  alternates: { canonical: "/" },
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
        <header className="site-header">
          <div className="container">
            <Link href="/" className="logo" aria-label="라벨공화국 홈">
              라벨공화국<small>노방장</small>
            </Link>
            <form action="/search" method="get" role="search" className="header-search">
              <input type="search" name="q" placeholder="성분, 제품, 스위치 검색" aria-label="검색어" maxLength={100} />
            </form>
            <Link href="/write" className="btn btn-primary">
              글쓰기
            </Link>
          </div>
        </header>
        <main>
          <div className="container">{children}</div>
        </main>
        <footer className="site-footer">
          <div className="container">
            <p>
              라벨공화국은 방장이 없습니다. 추천/비추천과 신고 5회 자동 블라인드로 모두가 함께 정화합니다.
              <br />
              원하는 보드가 없나요? <Link href="/boards">보드 개설 요청</Link>
            </p>
            <p>성분·스펙 정보는 사용자 제보이며 의학적 조언이 아닙니다.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
