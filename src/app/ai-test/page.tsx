import type { Metadata } from "next";
import { AiTest } from "@/components/AiTest";

export const metadata: Metadata = {
  title: "AI 판별 테스트 — AI가 흉내 낸 문장, 골라낼 수 있어요?",
  description: "진짜 시인의 문장과 AI가 흉내 낸 문장 10쌍. 진짜를 골라내는 1분 테스트. 다른 사람은 몇 개 맞혔는지, AI 문장을 알아보는 단서까지.",
  alternates: { canonical: "/ai-test" },
  openGraph: {
    title: "🤖 AI 판별 테스트 — 진짜 시인 vs AI, 몇 개 골라내요?",
    description: "윤동주·김소월 vs AI. 1분이면 끝나요. (어렵습니다.)",
    images: [{ url: "/ear/og-ai-test.png", width: 1200, height: 630 }],
  },
};

export default function AiTestPage() {
  return <AiTest />;
}
