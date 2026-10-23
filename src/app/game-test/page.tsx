import type { Metadata } from "next";
import { GameTest } from "@/components/GameTest";

export const metadata: Metadata = {
  title: "나는 어떤 게이머? 게임 1분 테스트",
  description: "랭크 올인파? 밤샘 스토리파? 친구랑 파티파? 질문 7개로 알아보는 나의 게임 타입.",
  alternates: { canonical: "/game-test" },
  openGraph: { title: "🎮 나는 어떤 게이머?", description: "질문 7개, 1분이면 나와요." },
};

export default function Page() {
  return <GameTest />;
}
