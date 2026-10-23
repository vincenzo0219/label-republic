import type { Metadata } from "next";
import { AnimeTest } from "@/components/AnimeTest";

export const metadata: Metadata = {
  title: "나는 어떤 오타쿠? 애니·만화 1분 테스트",
  description: "굿즈 수집가? 정주행 시청파? 원작 만화파? 질문 7개로 알아보는 나의 덕질 타입.",
  alternates: { canonical: "/anime-test" },
  openGraph: { title: "🎨 나는 어떤 오타쿠?", description: "질문 7개, 1분이면 나와요." },
};

export default function Page() {
  return <AnimeTest />;
}
