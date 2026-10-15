import type { Metadata } from "next";
import { FirstLineTest } from "@/components/FirstLineTest";

export const metadata: Metadata = {
  title: "첫 문장 테스트 — 첫 문장만 보고 무슨 책인지 알아요?",
  description: "어린 왕자, 1984, 날개… 유명한 책 10권의 첫 문장만 보고 제목을 맞히는 1분 테스트. 다른 독자는 몇 권 맞혔는지 확인해 보세요.",
  alternates: { canonical: "/first-line-test" },
  openGraph: {
    title: "📜 첫 문장 테스트 — 첫 문장만 보고 몇 권 맞혀요?",
    description: "유명한 책 10권, 첫 문장만 보고 제목 맞히기. (어렵습니다.)",
    images: [{ url: "/ear/og-first-line-test.png", width: 1200, height: 630 }],
  },
};

export default function FirstLineTestPage() {
  return <FirstLineTest />;
}
