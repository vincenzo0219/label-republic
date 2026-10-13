import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { BookAnswerForm, SameBookButton } from "@/components/BookAnswerForm";
import { fingerprint } from "@/lib/fingerprint";
import { getAsk } from "@/lib/repo/bookAsks";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

const load = cache(async (id: string) => {
  const ask = await getAsk(id, fingerprint((await headers()) as unknown as Headers));
  return ask && !ask.hidden ? ask : null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ask = await load((await params).id);
  if (!ask) return {};
  const top = ask.picks.slice(0, 3).map((p) => `『${p.title}』`).join(", ");
  return {
    title: `${ask.situation} — 상황별 책 추천`,
    description: top ? `많이 추천된 책: ${top}. 추천 ${ask.answers}개가 쌓여 있어요.` : `${ask.situation}, 어떤 책이 좋을까요? 첫 추천을 남겨 주세요.`,
    alternates: { canonical: `/books/ask/${ask.id}` },
    openGraph: { title: `📚 ${ask.situation}`, description: top || "추천이 쌓이는 상황별 책 추천", images: [{ url: "/ear/og-books.png", width: 1200, height: 630 }] },
  };
}

export default async function AskPage({ params }: Props) {
  const ask = await load((await params).id);
  if (!ask) notFound();
  return (
    <section className="book-wrap">
      <p className="ear-kicker">
        <Link href="/books/ask">📚 상황별 추천</Link>
      </p>
      <h1 className="book-title">{ask.situation}</h1>
      {ask.detail && <p className="book-line">{ask.detail}</p>}
      <p className="hint">
        {ask.nickname}님이 연 상황 · 추천 {ask.answers} · 책 {ask.books}권
      </p>

      {ask.picks.length === 0 ? (
        <p className="hint">아직 추천이 없어요. 첫 책을 추천해 주세요!</p>
      ) : (
        <ol className="book-picks">
          {ask.picks.map((p) => (
            <li key={p.bookId} className={p.mine ? "mine" : ""}>
              <div className="book-pick-head">
                <Link href={`/books/${p.bookId}`}>
                  <b>『{p.title}』</b>
                </Link>
                {p.author && <span className="book-author"> {p.author}</span>}
                <span className="book-rate-chip">추천 {p.count}</span>
              </div>
              {p.reasons.slice(0, 5).map((r, i) => (
                <p key={i} className="book-line">
                  <b>{r.nickname}</b> {r.reason}
                </p>
              ))}
              {!p.mine && <SameBookButton askId={ask.id} title={p.title} author={p.author} />}
            </li>
          ))}
        </ol>
      )}
      <BookAnswerForm askId={ask.id} situation={ask.situation} />
    </section>
  );
}
