import type { Metadata } from "next";
import { ParentTest } from "@/components/ParentTest";

export const metadata: Metadata = {
  title: "나는 어떤 육아 타입? 육아 1분 테스트",
  description: "꼼꼼 정보러? 기록 장인? 나들이 대장? 질문 7개로 알아보는 나의 육아 스타일.",
  alternates: { canonical: "/parent-test" },
  openGraph: { title: "👶 나는 어떤 육아 타입?", description: "질문 7개, 1분이면 나와요." },
};

export default function Page() {
  return <ParentTest />;
}
