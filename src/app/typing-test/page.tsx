import type { Metadata } from "next";
import { TypingTest } from "@/components/TypingTest";

export const metadata: Metadata = {
  title: "한글 타자 테스트 — 1분에 몇 타?",
  description: "짧은 문장 5개를 치고 타수와 정확도를 재는 1분 한글 타자 테스트. PC·휴대폰 참가자 중 몇 %인지, 다른 사람은 무슨 키보드로 쳤는지 확인해 보세요.",
  alternates: { canonical: "/typing-test" },
  openGraph: {
    title: "⌨️ 한글 타자 테스트 — 나는 몇 타?",
    description: "한컴 타자연습 이후 처음 재 보는 내 타수. 1분이면 끝나요.",
    images: [{ url: "/ear/og-typing-test.png", width: 1200, height: 630 }],
  },
};

export default function TypingTestPage() {
  return <TypingTest />;
}
