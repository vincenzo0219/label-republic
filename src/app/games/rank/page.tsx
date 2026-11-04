import type { Metadata } from "next";
import Link from "next/link";
import { RankBoard } from "@/components/GameRank";
import { isRankGame } from "@/lib/gameRank";

export const metadata: Metadata = {
  title: "🏆 미니게임 전국 랭킹",
  description: "승부차기·반응속도·라떼아트·랠리 오늘·이번 주·전체 전국 순위",
  alternates: { canonical: "/games/rank" },
};

type Props = { searchParams: Promise<{ game?: string }> };

/** 🏆 미니게임 전국 랭킹 (11/4 대표님 "지난기록 도전으로 가자. 전국 랭킹") */
export default async function GameRankPage({ searchParams }: Props) {
  const g = (await searchParams).game;
  return (
    <main className="mini-game gr-page">
      <header className="mg-head">
        <Link href="/" className="mg-back">← 노방장</Link>
        <h1 className="mg-title">🏆 전국 랭킹</h1>
        <p className="mg-sub">다른 사람이 남긴 진짜 기록이에요. 넘으면 순위가 올라가요.</p>
      </header>
      <RankBoard initialGame={g && isRankGame(g) ? g : "pk"} />
    </main>
  );
}
