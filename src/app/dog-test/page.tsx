import type { Metadata } from "next";
import { DogTest } from "@/components/DogTest";

export const metadata: Metadata = {
  title: "나는 어떤 견주? — 견주 1분 테스트",
  description: "산책왕? 성분표 박사? 질문 4개로 알아보는 나의 견주 타입.",
  alternates: { canonical: "/dog-test" },
  openGraph: { title: "🐶 나는 어떤 견주?", description: "질문 4개, 1분이면 나와요." },
};

export default function Page() {
  return <DogTest />;
}
