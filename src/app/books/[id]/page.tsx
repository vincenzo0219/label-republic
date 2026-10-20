import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { BookRecordForm } from "@/components/BookRecordForm";
import { BOOK_MIN_FOR_RATE, BOOK_ROOM_SLUG, BOOK_STATUS_LABEL } from "@/lib/books";
import { fingerprint } from "@/lib/fingerprint";
import { timeAgo } from "@/lib/format";
import { getBook } from "@/lib/repo/books";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

const load = cache(async (id: string) => getBook(id, fingerprint((await headers()) as unknown as Headers)));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const book = await load((await params).id);
  if (!book) return {};
  const rateText = book.rate !== null ? `완독률 ${book.rate}%` : "끝까지 읽을 만한지";
  return {
    title: `『${book.title}』 ${rateText} — 책 카드`,
    description: `${book.author ? `${book.author} 『${book.title}』` : `『${book.title}』`} 실제 독자 기록: 완독 ${book.done} · 중도 포기 ${book.dropped} · 읽는 중 ${book.reading}. 다음에 읽은 책도 확인해 보세요.`,
    alternates: { canonical: `/books/${book.id}` },
    openGraph: { title: `📖 『${book.title}』, 끝까지 읽을 만해요?`, description: `${rateText} · 실제 독자 기록으로`, images: [{ url: "/ear/og-books.png", width: 1200, height: 630 }] },
  };
}

export default async function BookPage({ params }: Props) {
  const book = await load((await params).id);
  if (!book) notFound();
  const total = book.reading + book.done + book.dropped;
  const mine = book.reads.find((r) => r.mine) ?? null;
  return (
    <section className="book-wrap">
      <p className="ear-kicker">
        <Link href="/books">📖 책 카드</Link>
      </p>
      <h1 className="book-title">『{book.title}』</h1>
      {book.author && <p className="book-author">{book.author}</p>}

      <div className="book-stats" aria-label="독자 기록 통계">
        <div className="book-rate">
          {book.rate !== null ? (
            <>
              <b>{book.rate}%</b>
              <span>완독률</span>
            </>
          ) : (
            <span className="hint">완독·중도 포기 기록이 {BOOK_MIN_FOR_RATE}개 모이면 완독률이 보여요</span>
          )}
        </div>
        <ul className="book-counts">
          {(["done", "dropped", "reading"] as const).map((s) => (
            <li key={s}>
              {BOOK_STATUS_LABEL[s].emoji} {BOOK_STATUS_LABEL[s].label} <b>{book[s]}</b>
            </li>
          ))}
        </ul>
        {book.dropAt !== null && <p className="hint">🏳️ 중도 포기한 사람들은 평균 <b>{book.dropAt}%</b> 지점에서 멈췄어요.</p>}
      </div>

      {book.editions.length > 0 && (
        <div className="book-next">
          <h2>출판사(번역)별</h2>
          <table className="ear-table">
            <thead>
              <tr>
                <th>출판사·번역</th>
                <th>기록</th>
                <th>완독률</th>
              </tr>
            </thead>
            <tbody>
              {book.editions.map((e) => (
                <tr key={e.edition}>
                  <td>{e.edition}</td>
                  <td>
                    {e.total} (완독 {e.done} · 포기 {e.dropped})
                  </td>
                  <td>{e.rate !== null ? `${e.rate}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">&ldquo;안 읽히면 번역을 의심해 보라&rdquo;는 말, 여기서 확인해 보세요. 완독률은 출판사마다 기록이 {BOOK_MIN_FOR_RATE}개 모이면 보여요.</p>
        </div>
      )}

      {book.askedIn.length > 0 && (
        <div className="book-next">
          <h2>이 책이 추천된 상황</h2>
          <div className="book-chips">
            {book.askedIn.map((a) => (
              <Link key={a.id} href={`/books/ask/${a.id}`} className="chip">
                {a.situation} · {a.count}
              </Link>
            ))}
          </div>
        </div>
      )}

      {book.nextBooks.length > 0 && (
        <div className="book-next">
          <h2>이 책 다음에 읽은 책</h2>
          <ol>
            {book.nextBooks.map((n) => (
              <li key={n.title}>
                {n.bookId ? <Link href={`/books/${n.bookId}`}>『{n.title}』</Link> : <>『{n.title}』</>} <span className="hint">{n.count}명</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <BookRecordForm bookId={book.id} title={book.title} mine={mine} />

      <h2 className="book-h2">독자 기록 {total}</h2>
      {book.reads.length === 0 ? (
        <p className="hint">아직 기록이 없어요. 첫 기록을 남겨 주세요!</p>
      ) : (
        <ul className="book-reads">
          {book.reads.map((r) => (
            <li key={r.id} className={r.mine ? "mine" : ""}>
              <div className="book-read-head">
                <b>{r.nickname}</b>
                <span className={`book-chip ${r.status}`}>
                  {BOOK_STATUS_LABEL[r.status].emoji} {BOOK_STATUS_LABEL[r.status].label}
                  {r.status !== "done" && ` · ${r.progress}%`}
                </span>
                <span className="hint">{timeAgo(r.updated_at)}</span>
              </div>
              <div className="book-bar" aria-hidden>
                <span style={{ width: `${r.progress}%` }} />
              </div>
              {r.hidden ? <p className="hint">가려진 한 줄이에요.</p> : r.line && <p className="book-line">{r.line}</p>}
              {r.edition && <p className="hint">📗 {r.edition}</p>}
              {r.next_title && <p className="hint">→ 다음 책: 『{r.next_title}』</p>}
            </li>
          ))}
        </ul>
      )}
      <Link href={`/c/${encodeURIComponent(BOOK_ROOM_SLUG)}`} className="ear-cta">
        💬 이 책 이야기 더 하기 — 책 덕후방 →
      </Link>
    </section>
  );
}
