import type { Metadata } from "next";
import { VeganTest } from "@/components/VeganTest";

export const metadata: Metadata = {
  title: "나는 어떤 채식 타입? — 채식 1분 테스트",
  description: "질문 4개로 알아보는 나의 채식 타입. 플렉시테리언, 페스코, 락토오보, 비건, 라이프스타일 비건.",
  alternates: { canonical: "/vegan-test" },
  openGraph: { title: "🌱 나는 어떤 채식 타입?", description: "질문 4개, 1분이면 나의 채식 타입이 나와요." },
};

export default function VeganTestPage() {
  return <VeganTest />;
}
