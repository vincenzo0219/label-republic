import type { Metadata } from "next";
import { DramaTest } from "@/components/DramaTest";

export const metadata: Metadata = {
  title: "나는 어떤 드라마러? 드라마 1분 테스트",
  description: "정주행 몰아보기파? 본방 사수파? 명대사 수집파? 질문 7개로 알아보는 나의 드라마 타입.",
  alternates: { canonical: "/drama-test" },
  openGraph: { title: "📺 나는 어떤 드라마러?", description: "질문 7개, 1분이면 나와요." },
};

export default function Page() {
  return <DramaTest />;
}
