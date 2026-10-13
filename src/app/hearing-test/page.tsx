import type { Metadata } from "next";
import { HearingTest } from "@/components/HearingTest";

export const metadata: Metadata = {
  title: "고음 청력 테스트 — 몇 kHz까지 들리나요?",
  description: "8kHz부터 20kHz까지, A·B 중 소리 난 쪽을 고르는 1분 테스트. 내 귀가 몇 kHz까지 듣는지, 참가자 중 몇 %인지 확인해 보세요.",
  alternates: { canonical: "/hearing-test" },
  openGraph: {
    title: "🦟 고음 청력 테스트 — 몇 kHz까지 들려요?",
    description: "모기 소리까지 들리면 상위 몇 %? 이어폰 끼고 1분이면 끝나요.",
    images: [{ url: "/ear/og-hearing-test.png", width: 1200, height: 630 }],
  },
};

export default function HearingTestPage() {
  return <HearingTest />;
}
