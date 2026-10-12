import type { Metadata } from "next";
import { EarTest } from "@/components/EarTest";

export const metadata: Metadata = {
  title: "황금귀 테스트 — 압축 음질, 들으면 구분될까?",
  description: "원본과 MP3 압축본(64~192kbps)을 듣고 원본을 고르는 1분 블라인드 테스트. 10문제를 풀고 내 귀 등급과 참가자 순위를 확인해 보세요.",
  alternates: { canonical: "/ear-test" },
  openGraph: {
    title: "🎧 황금귀 테스트 — 당신 귀, 상위 몇 %?",
    description: "원본 vs MP3 압축본 블라인드 테스트 10문제. 1분이면 끝나요.",
    images: [{ url: "/ear/og-ear-test.png", width: 1200, height: 630 }],
  },
};

export default function EarTestPage() {
  return <EarTest />;
}
