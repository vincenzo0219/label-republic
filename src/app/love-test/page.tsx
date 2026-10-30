import type { Metadata } from "next";
import { LoveTest } from "@/components/LoveTest";

export const metadata: Metadata = {
  title: "나의 연애 성향은? 1분 테스트",
  description: "직진형? 천천히 스며드는 형? 대화 우선형? 질문 7개로 알아보는 나의 연애 성향.",
  alternates: { canonical: "/love-test" },
  openGraph: { title: "💘 나의 연애 성향은?", description: "질문 7개, 1분이면 나와요." },
};

export default function Page() {
  return <LoveTest />;
}
