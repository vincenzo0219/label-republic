import type { Metadata } from "next";
import { ShoeTest } from "@/components/ShoeTest";

export const metadata: Metadata = {
  title: "나는 어떤 신발러? 신발 1분 테스트",
  description: "데일리 컴포트파? 드로우 사냥꾼? 클린 콜렉터? 질문 7개로 알아보는 나의 신발 타입.",
  alternates: { canonical: "/shoe-test" },
  openGraph: { title: "👟 나는 어떤 신발러?", description: "질문 7개, 1분이면 나와요." },
};

export default function Page() {
  return <ShoeTest />;
}
