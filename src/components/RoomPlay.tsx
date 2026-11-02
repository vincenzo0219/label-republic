import Link from "next/link";
import { playItems } from "@/lib/roomPlay";
import { typeTestOf } from "@/lib/typeTests";
import { weekEvents, type WeekEvent } from "@/lib/repo/roomBoards";
import { RoomQuiz } from "./RoomQuiz";
import { SentencePick } from "./SentencePick";
import { GoingWeek, RoomBoard, WeekRank } from "./RoomBoard";
import { SavingsCard } from "./SavingsCard";
import { TypeTest } from "./TypeTest";

/**
 * 🧩 방 놀이 탭 (?tab=play, 11/2). 설정은 src/lib/roomPlay.ts. 첫 새 테스트는 탭 안에서 바로, 나머지는 카드로
 */
export async function RoomPlay({ slug, name = "" }: { slug: string; name?: string }) {
  const items = playItems(slug);
  const firstTest = items.find((i) => i.kind === "test");
  const events: WeekEvent[] = items.some((i) => i.kind === "going") ? await weekEvents(slug).catch(() => []) : [];
  return (
    <div className="room-play">
      {items.map((it, i) => {
        if (it.kind === "quiz") return <RoomQuiz key="quiz" slug={slug} name={name} />;
        if (it.kind === "savings") return <SavingsCard key="savings" />;
        if (it.kind === "bookTaste") return <SentencePick key="bookTaste" />; // 11/2 대표님: 체크표 대신 문장 바로 고르기
        if (it.kind === "board") return <RoomBoard key={it.key} boardKey={it.key} />;
        if (it.kind === "going") return <GoingWeek key="going" events={events} why="새 행사 글이 올라오면 여기에 떠요." />;
        if (it.kind === "rank") return <WeekRank key={`rank-${it.game}`} game={it.game} />;
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
