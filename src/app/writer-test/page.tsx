import type { Metadata } from "next";
import { WriterTest } from "@/components/WriterTest";

export const metadata: Metadata = {
  title: "나는 어떤 장르 작가? 웹소설 1분 테스트",
  description: "판타지, 현판, 로판, 무협, 로맨스, 대체역사·SF. 질문 5개로 알아보는 나의 장르.",
  alternates: { canonical: "/writer-test" },
  openGraph: { title: "✍️ 나는 어떤 장르 작가?", description: "질문 5개, 1분이면 나와요." },
};

export default function Page() {
  return <WriterTest />;
}
