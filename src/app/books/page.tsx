import type { Metadata } from "next";
import Link from "next/link";
import { BookAddForm } from "@/components/BookAddForm";
import { ReadingNow } from "@/components/ReadingNow";
import { BOOK_ROOM_SLUG, completionRate } from "@/lib/books";
import { listBooks } from "@/lib/repo/books";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "책 카드 — 이 책, 끝까지 읽을 만해요?",
  description: "책마다 한 장. 실제 독자들이 남긴 완독·중도 포기 기록으로 완독률과 '다음에 읽은 책'을 보여 줘요. 스레드처럼 밀려 사라지지 않아요.",
  alternates: { canonical: "/books" },
  openGraph: {
    title: "📖 이 책, 끝까지 읽을 만해요? — 노방장 책 카드",
    description: "완독률 · 중도 포기 지점 · 다음에 읽은 책. 실제 독자 기록으로.",
    images: [{ url: "/ear/og-books.png", width: 1200, height: 630 }],
  },
};

export default async function BooksPage() {
  const books = await listBooks();
  return (
    <section className="book-wrap">
      <p className="ear-kicker">📖 책 카드</p>
      <h1 className="ear-title">
        이 책, <em>끝까지</em> 읽을 만해요?
      </h1>
      <p className="hint">
        책마다 한 장씩, 읽은 사람들이 <b>읽는 중 · 완독 · 중도 포기</b>와 한 줄을 남겨요. 쌓일수록 완독률과 &ldquo;이 책 다음에 뭐 읽었는지&rdquo;가 보여요. 피드처럼 밀려 사라지지 않아요.
      </p>
      <ReadingNow />
      <Link href="/books/ask" className="ear-banner">
        <span className="ear-banner-emoji" aria-hidden>
          📚
        </span>
        <span>
          <b>상황별 추천</b> — &ldquo;불안할 때&rdquo;, &ldquo;선물할 때&rdquo; 읽을 책, 추천이 쌓여요 <span className="ear-banner-go">보러 가기 →</span>
        </span>
      </Link>
      <BookAddForm />
      {books.length === 0 ? (
        <p className="hint">아직 책 카드가 없어요. 지금 읽는 책으로 첫 카드를 만들어 주세요!</p>
      ) : (
        <ul className="book-list">
          {books.map((b) => {
            const rate = completionRate(b.done, b.dropped);
            const total = b.reading + b.done + b.dropped;
            return (
              <li key={b.id}>
                <Link href={`/books/${b.id}`} className="book-item">
                  <span className="book-item-title">
                    <b>{b.title}</b>
                    {b.author && <span className="book-author"> · {b.author}</span>}
                  </span>
                  <span className="book-item-stats">
                    {total === 0 ? "첫 기록을 기다려요" : `기록 ${total} · 완독 ${b.done} · 포기 ${b.dropped}`}
                    {rate !== null && <b className="book-rate-chip">완독률 {rate}%</b>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Link href={`/c/${encodeURIComponent(BOOK_ROOM_SLUG)}`} className="ear-cta">
        💬 책 이야기는 &ldquo;읽는 책 제목을 교환해 보자&rdquo; 방에서 →
      </Link>
    </section>
  );
}
