import type { Metadata } from "next";
import { friendMetadata, type SearchParams } from "@/lib/friendMeta";
import { LoveTest } from "@/components/LoveTest";

const metadata: Metadata = {
  title: "나의 연애 성향은? 1분 테스트",
  description: "직진형? 천천히 스며드는 형? 대화 우선형? 질문 7개로 알아보는 나의 연애 성향.",
  alternates: { canonical: "/love-test" },
  openGraph: { title: "💘 나의 연애 성향은?", description: "질문 7개, 1분이면 나와요." },
};

/** 🤝 친구 대결·궁합 링크(?vs= · ?m=)면 미리보기를 친구 기록 카드로 */
export function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  return friendMetadata(metadata, "love", searchParams);
}

export default function Page() {
  return <LoveTest />;
}
