import type { Metadata } from "next";
import Link from "next/link";
import { AskCard } from "@/components/AskCard";
import { BookAskForm } from "@/components/BookAskForm";
import { listAsks } from "@/lib/repo/bookAsks";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "상황별 책 추천 — ○○할 때 읽을 책",
  description: "\"불안할 때 읽을 책\", \"선물하기 좋은 책\"처럼 상황마다 한 장. 추천이 밀려 사라지지 않고 쌓여서, 많이 추천된 책이 위로 올라와요.",
  alternates: { canonical: "/books/ask" },
  openGraph: { title: "📚 ○○할 때 읽을 책, 추천이 쌓이는 곳", description: "상황별 추천 — 노방장 책 카드", images: [{ url: "/ear/og-books.png", width: 1200, height: 630 }] },
};

export default async function AsksPage() {
  const asks = await listAsks();
  return (
    <section className="book-wrap">
      <p className="ear-kicker">
        <Link href="/books">📖 책 카드</Link> · 상황별 추천
      </p>
      <h1 className="ear-title">
        <em>○○할 때</em> 읽을 책
      </h1>
      <BookAskForm />
      {asks.length === 0 ? (
        <p className="hint">아직 상황이 없어요. 첫 상황을 열어 주세요!</p>
      ) : (
        <ul className="ask-list">
          {asks.map((a) => (
            <AskCard key={a.id} ask={a} />
          ))}
        </ul>
      )}
    </section>
  );
}
