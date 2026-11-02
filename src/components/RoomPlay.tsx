import Link from "next/link";
import { playItems } from "@/lib/roomPlay";
import { typeTestOf } from "@/lib/typeTests";
import { BookTasteTable } from "./BookTasteTable";
import { SavingsCard } from "./SavingsCard";
import { TypeTest } from "./TypeTest";

/**
 * 🧩 방 놀이 탭 (?tab=play, 11/2). 설정은 src/lib/roomPlay.ts. 첫 새 테스트는 탭 안에서 바로, 나머지는 카드로
 */
export function RoomPlay({ slug }: { slug: string }) {
  const items = playItems(slug);
  const firstTest = items.find((i) => i.kind === "test");
  return (
    <div className="room-play">
      {items.map((it, i) => {
        if (it.kind === "savings") return <SavingsCard key="savings" />;
        if (it.kind === "bookTaste") return <BookTasteTable key="bookTaste" />;
        if (it.kind === "test") {
          const t = typeTestOf(it.key);
          if (!t) return null;
          if (it === firstTest) return <TypeTest key={t.key} test={t} embedded />;
          return (
            <Link key={t.key} href={`/t/${t.key}`} className="play-card">
              <span className="play-emoji" aria-hidden>{t.emoji}</span>
              <span className="play-body">
                <b>{t.title}</b>
                <span className="hint">{t.description}</span>
              </span>
            </Link>
          );
        }
        return (
          <Link key={`${it.href}-${i}`} href={it.href} className="play-card">
            <span className="play-emoji" aria-hidden>{it.emoji}</span>
            <span className="play-body">
              <b>
                {it.title}
                {it.duel && <span className="play-tag">🤝 친구 대결</span>}
                {it.mate && <span className="play-tag">💞 궁합</span>}
                {it.adult && <span className="play-tag">19+</span>}
              </b>
              <span className="hint">{it.sub}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
