import type { Metadata } from "next";
import { VivTest } from "@/components/VivTest";

export const metadata: Metadata = {
  title: "나는 어떤 비바리움러? 비바리움 1분 테스트",
  description: "레이아웃 장인? 관찰 기록파? 먹이·사육 연구파? 질문 7개로 알아보는 나의 비바리움 타입.",
  alternates: { canonical: "/viv-test" },
  openGraph: { title: "🌿 나는 어떤 비바리움러?", description: "질문 7개, 1분이면 나와요." },
};

export default function Page() {
  return <VivTest />;
}
