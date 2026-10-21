import type { Metadata } from "next";
import { YogaTest } from "@/components/YogaTest";

export const metadata: Metadata = {
  title: "나는 어떤 수련 타입? — 요가·필라테스 1분 테스트",
  description: "코어 집중러? 힐링 수련러? 요가템 수집가? 질문 4개로 알아보는 나의 요가·필라테스 타입.",
  alternates: { canonical: "/yoga-test" },
  openGraph: { title: "🧘 나는 어떤 수련 타입?", description: "질문 4개, 1분이면 나와요." },
};

export default function Page() {
  return <YogaTest />;
}
