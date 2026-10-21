import type { Metadata } from "next";
import { RunnerTest } from "@/components/RunnerTest";

export const metadata: Metadata = {
  title: "나는 어떤 러너? — 러너 1분 테스트",
  description: "새벽 혼런러? 기록 사냥꾼? 대회 메달러? 질문 4개로 알아보는 나의 러닝 타입.",
  alternates: { canonical: "/run-test" },
  openGraph: { title: "🏃 나는 어떤 러너?", description: "질문 4개, 1분이면 나와요." },
};

export default function Page() {
  return <RunnerTest />;
}
