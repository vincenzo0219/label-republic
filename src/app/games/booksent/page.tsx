import type { Metadata } from "next";
import Link from "next/link";
import { BookSentenceGame } from "@/components/BookSentenceGame";

export const metadata: Metadata = {
  title: "📖 오늘의 첫 문장 맞히기",
  description: "첫 문장만 보고 어떤 책인지 맞히는 하루 10문제. 전국 랭킹",
  alternates: { canonical: "/games/booksent" },
};

/** 📖 오늘의 첫 문장 맞히기 (11/4 대표님 "책방도 책 게임으로 전국 랭킹") */
export default function BookSentencePage() {
  return (
    <main className="mini-game bs-page">
      <header className="mg-head">
        <Link href="/c/읽는-책-제목을-교환해-보자" className="mg-back">← 책 덕후방</Link>
        <h1 className="mg-title">📖 첫 문장 맞히기</h1>
      </header>
      <BookSentenceGame />
    </main>
  );
}
