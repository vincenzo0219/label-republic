import Link from "next/link";
import { listCategories, quietRoomSlugs, roomActivity } from "@/lib/repo/categories";
import { roomColor, roomEmoji, roomShortName } from "@/lib/myRooms";
import { ttlMemo } from "@/lib/ttlMemo";

const cachedRooms = ttlMemo((_: number) => listCategories(), 60_000);
const cachedQuiet = ttlMemo((_: number) => quietRoomSlugs(), 60_000);
const cachedActivity = ttlMemo((_: number) => roomActivity(), 60_000);
/** 처음 화면에 보여 줄 방 수 (4칸 × 2줄, 마지막 칸은 전체보기) */
const FIRST_ROOMS = 7;

/**
 * 🏠 방 둘러보기 (10/30 대표님 "네이버 카페·밴드처럼, 헷갈리지 않게"): 큰 아이콘 칸.
 * 오늘 이야기(사람 글·댓글)가 많은 방 먼저, 조용한 방은 뒤로. all 이 아니면 7개 + "전체보기" 칸, all 이면 전부 + "＋ 방 만들기".
 */
export async function RoomGrid({ all, mine = [] }: { all: boolean; mine?: string[] }) {
  const [rooms, quiet, activity] = await Promise.all([
    cachedRooms(0).catch(() => []),
    cachedQuiet(0).catch(() => new Set<string>()),
    cachedActivity(0).catch(() => ({}) as Record<string, number>),
  ]);
  const sorted = [...rooms].sort((a, b) => {
    const qa = quiet.has(a.slug) ? 1 : 0;
    const qb = quiet.has(b.slug) ? 1 : 0;
    if (qa !== qb) return qa - qb;
    return (activity[b.slug] ?? 0) - (activity[a.slug] ?? 0);
  });
  const shown = all ? sorted : sorted.slice(0, FIRST_ROOMS);
  return (
    <section className="home-sec" id="rooms" aria-label="방 둘러보기">
      <div className="home-sec-head">
        <h2>
          🏠 방 둘러보기 <span>· {rooms.length}개</span>
        </h2>
      </div>
      <ul className="room-icons grid">
        {shown.map((c) => (
          <li key={c.slug}>
            <Link href={`/c/${encodeURIComponent(c.slug)}`} className="room-icon-tile">
              <span className="room-icon" style={{ "--acc": roomColor(c.slug) } as React.CSSProperties} aria-hidden>
                {roomEmoji(c.slug)}
              </span>
              <span className="room-icon-name">
                {roomShortName(c)}
                {mine.includes(c.slug) && <span aria-label="내 방"> ★</span>}
              </span>
            </Link>
          </li>
        ))}
        <li>
          {all ? (
            <Link href="/boards" className="room-icon-tile">
              <span className="room-icon add" aria-hidden>＋</span>
              <span className="room-icon-name">방 만들기</span>
            </Link>
          ) : (
            <Link href="/?all=1#rooms" className="room-icon-tile">
              <span className="room-icon add" aria-hidden>☰</span>
              <span className="room-icon-name">전체보기 {rooms.length}</span>
            </Link>
          )}
        </li>
      </ul>
    </section>
  );
}
