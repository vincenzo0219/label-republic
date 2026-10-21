import type { Metadata } from "next";
import { BaseballTest } from "@/components/BaseballTest";

export const metadata: Metadata = {
  title: "나는 어떤 야구 팬? — 야구 팬 1분 테스트",
  description: "직관 응원단? 기록 분석가? 야구장 먹방러? 질문 4개로 알아보는 나의 야구 팬 타입.",
  alternates: { canonical: "/kbo-test" },
  openGraph: { title: "⚾ 나는 어떤 야구 팬?", description: "질문 4개, 1분이면 나와요." },
};

export default function Page() {
  return <BaseballTest />;
}
