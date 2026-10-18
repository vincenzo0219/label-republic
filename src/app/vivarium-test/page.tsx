import type { Metadata } from "next";
import { VivariumTest } from "@/components/VivariumTest";

export const metadata: Metadata = {
  title: "우리 집에서 키울 수 있을까? — 비바리움 1분 테스트",
  description: "자리·시간·먹이·핸들링 질문 4개로 나에게 맞는 첫 생물을 골라 봐요. 이끼 테라리움, 등각류, 크레스티드 게코, 레오파드 게코, 다트프록.",
  alternates: { canonical: "/vivarium-test" },
  openGraph: { title: "🦎 우리 집에서 키울 수 있을까?", description: "질문 4개, 1분이면 나에게 맞는 첫 생물이 나와요." },
};

export default function VivariumTestPage() {
  return <VivariumTest />;
}
