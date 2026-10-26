import Link from "next/link";
import { HEAD_PREFIX } from "@/lib/heads";
import { todayCards } from "@/lib/repo/cards";
import { ttlMemo } from "@/lib/ttlMemo";
import { CheerButton } from "./CheerButton";

// 방(조합)마다 30초 재사용 — 누른 수는 버튼이 바로 바꿔 보여 준다
const cached = ttlMemo((key: string) => todayCards(key.split(",")), 30_000);

/**
 * 🎉 오늘 축하할 덕후 (10/26) — 방 맨 위·홈(내 방들)에 오늘 올라온 기념일·응원 카드. 글을 열지 않고 줄 안에서 바로 🎉·💪 한 번.
 * 없으면 안 보인다.
 */
export async function TodayCards({ rooms, showRoom = false }: { rooms: string[]; showRoom?: boolean }) {
  if (!rooms.length) return null;
  const cards = await cached([...rooms].sort().join(",")).catch(() => []);
  if (!cards.length) return null;
  return (
    <section className="today-cards" aria-label="오늘 축하할 덕후">
      <span className="today-cards-title">🎉 오늘 축하할 덕후</span>
      <ul>
        {cards.map((c) => (
          <li key={c.id}>
            <Link href={`/posts/${c.id}`}>
              {c.title.replace(HEAD_PREFIX, "")}
              {showRoom && <span className="hint"> · {c.room_name}</span>}
            </Link>
            <CheerButton postId={c.id} initial={c.cheers} kind={c.card_kind} variant="strip" />
          </li>
        ))}
      </ul>
    </section>
  );
}
