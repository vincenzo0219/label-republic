import type { Metadata } from "next";
import { WineTest } from "@/components/WineTest";

export const metadata: Metadata = {
  title: "나의 술 취향은? 와인·위스키 1분 테스트",
  description: "묵직 레드파? 스모키 피트파? 가벼운 산뜻파? 질문 6개로 알아보는 나의 맛 취향. 만 19세 이상.",
  alternates: { canonical: "/wine-test" },
  openGraph: { title: "🍷 나의 술 취향은?", description: "질문 6개, 1분이면 나와요. 만 19세 이상." },
};

export default function Page() {
  return <WineTest />;
}
