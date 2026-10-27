import Link from "next/link";
import type { Category } from "@/lib/types";
import { listSinglesEvents } from "@/lib/repo/singlesEvents";
import { ensureSinglesTalks } from "@/lib/repo/singlesTalk";
import { SINGLES_ROOM, SINGLES_SCOPE_NOTE, todayKst } from "@/lib/singlesEvents";
import { SinglesRoom } from "./SinglesRoom";

/** 💌 만남 행사: 운영자가 넣은 행사 카드 + 나 신청 가능? + 알림. 미혼남녀 만남 행사 방의 💌 만남 행사 탭 (098) */
export async function SinglesTab() {
  const today = todayKst();
  const events = await listSinglesEvents({ today }).catch(() => []);
  const talks = await ensureSinglesTalks(events).catch(() => ({}));
  return (
    <>
      <p className="hint singles-scope">{SINGLES_SCOPE_NOTE}</p>
      {/* hidden 필드는 화면에 넘기지 않는다 */}
      <SinglesRoom events={events.map(({ hidden: _h, ...e }) => e)} today={today} talks={talks} />
    </>
  );
}

/**
 * 정보만 보여 주는 방 (categories.info_only, 092). 글 목록·✍️ 글쓰기·💬 채팅 탭이 없다.
 * 💌 미혼남녀 만남 행사 방은 098 부터 다른 방처럼 글·채팅이 있고, 행사 화면은 그 방의 💌 만남 행사 탭이다.
 */
export async function InfoOnlyRoom({ category }: { category: Category }) {
  return (
    <>
      <h1 className="sr-only">{category.name} 방</h1>
      <div className="board-head singles-head">
        <span className="room-title">
          <span className="room-name">{category.name}</span>
          <Link href="/?all=1" className="all-rooms-link">☰ 전체 방</Link>
        </span>
        <p className="room-desc">{category.description}</p>
      </div>
      {category.slug === SINGLES_ROOM ? <SinglesTab /> : <p className="empty">이 방은 정보만 모아 보여 줘요.</p>}
    </>
  );
}
