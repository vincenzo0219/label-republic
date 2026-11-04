import type { Metadata } from "next";
import Link from "next/link";
import { AniChosungGame } from "@/components/AniChosungGame";

export const metadata: Metadata = {
  title: "🎨 애니 제목 초성 60초",
  description: "초성만 보고 애니 제목을 맞히는 하루 한 판. 전국 랭킹",
  alternates: { canonical: "/games/anichosung" },
};

/** 🎨 애니 제목 초성 60초 (11/4 대표님 "책·애니·K리그로 진행해") */
export default function AniChosungPage() {
  return (
    <main className="mini-game ac-page">
      <header className="mg-head">
        <Link href="/c/애니-만화-덕후방" className="mg-back">← 애니·만화 덕후방</Link>
        <h1 className="mg-title">🎨 애니 제목 초성 60초</h1>
      </header>
      <AniChosungGame />
    </main>
  );
}
