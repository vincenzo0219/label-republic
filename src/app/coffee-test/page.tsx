import type { Metadata } from "next";
import { CoffeeTest } from "@/components/CoffeeTest";

export const metadata: Metadata = {
  title: "나는 어떤 커피러? 커피 1분 테스트",
  description: "아아 직진파? 핸드드립 탐험가? 달달 라떼파? 질문 7개로 알아보는 나의 커피 타입.",
  alternates: { canonical: "/coffee-test" },
  openGraph: { title: "☕ 나는 어떤 커피러?", description: "질문 7개, 1분이면 나와요." },
};

export default function Page() {
  return <CoffeeTest />;
}
