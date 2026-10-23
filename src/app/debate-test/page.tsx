import type { Metadata } from "next";
import { DebateTest } from "@/components/DebateTest";

export const metadata: Metadata = {
  title: "나의 토론 스타일은? 1분 테스트",
  description: "논리파? 중재파? 승부사? 악마의 변호인? 질문 7개로 알아보는 나의 토론 스타일.",
  alternates: { canonical: "/debate-test" },
  openGraph: { title: "⚖️ 나의 토론 스타일은?", description: "질문 7개, 1분이면 나와요." },
};

export default function Page() {
  return <DebateTest />;
}
