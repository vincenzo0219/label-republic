import type { Metadata } from "next";
import { friendMetadata, type SearchParams } from "@/lib/friendMeta";
import { FanTest } from "@/components/FanTest";

const metadata: Metadata = {
  title: "나는 어떤 축구 팬? — 축구 팬 1분 테스트",
  description: "직관파? 분석가? 굿즈 수집가? 질문 4개로 알아보는 나의 축구 팬 타입.",
  alternates: { canonical: "/fan-test" },
  openGraph: { title: "⚽ 나는 어떤 축구 팬?", description: "질문 4개, 1분이면 나와요." },
};

/** 🤝 친구 대결·궁합 링크(?vs= · ?m=)면 미리보기를 친구 기록 카드로 */
export function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  return friendMetadata(metadata, "fan", searchParams);
}

export default function Page() {
  return <FanTest />;
}
