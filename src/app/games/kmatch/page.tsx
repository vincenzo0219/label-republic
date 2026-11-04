import type { Metadata } from "next";
import Link from "next/link";
import { KMatchGame } from "@/components/KMatchGame";

export const metadata: Metadata = {
  title: "🏟️ K리그 구단·홈구장 짝 맞추기",
  description: "K리그1 구단과 홈구장을 짝짓는 하루 한 판. 전국 랭킹",
  alternates: { canonical: "/games/kmatch" },
};

/** 🏟️ K리그 구단·홈구장 짝 맞추기 (11/4 대표님 "책·애니·K리그로 진행해") */
export default function KMatchPage() {
  return (
    <main className="mini-game km-page">
      <header className="mg-head">
        <Link href="/c/k리그-덕후방" className="mg-back">← K리그 덕후방</Link>
        <h1 className="mg-title">🏟️ 구단·홈구장 짝 맞추기</h1>
      </header>
      <KMatchGame />
    </main>
  );
}
