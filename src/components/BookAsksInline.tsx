import { AskCard } from "./AskCard";
import { BookAskForm } from "./BookAskForm";
import { listAsks } from "@/lib/repo/bookAsks";

/** 책 덕후방 📚 추천 탭 안의 상황별 추천 (10/23 사용자 "추천과 물어보기 합쳐서") — /books/ask 와 같은 목록 */
export async function BookAsksInline() {
  const asks = await listAsks();
  return (
    <section className="book-wrap" aria-label="상황별 추천">
      <h2 className="ear-title">
        <em>○○할 때</em> 읽을 책
      </h2>
      <BookAskForm />
      {asks.length > 0 && (
        <ul className="ask-list">
          {asks.map((a) => (
            <AskCard key={a.id} ask={a} />
          ))}
        </ul>
      )}
    </section>
  );
}
