import Link from "next/link";
import { listCategories } from "@/lib/repo/categories";
import { RoomTopBar } from "./RoomTopBar";
import type { Category } from "@/lib/types";
import { listSinglesEvents } from "@/lib/repo/singlesEvents";
import { ensureSinglesTalks } from "@/lib/repo/singlesTalk";
import { SINGLES_ROOM, todayKst } from "@/lib/singlesEvents";
import { SinglesRoom } from "./SinglesRoom";
import { SinglesCalendar } from "./SinglesCalendar";
import { DebateVote } from "./DebateVote";
import { recentRoomPolls } from "@/lib/repo/debateVotes";
import { GENDER_MIN } from "@/lib/genderSplit";

/** 💌 만남 행사: 운영자가 넣은 행사 카드 + 나 신청 가능? + 알림. 미혼남녀 만남 행사 방의 💌 만남 행사 탭 (098) */
export async function SinglesTab() {
  const today = todayKst();
  const events = await listSinglesEvents({ today }).catch(() => []);
  const talks = await ensureSinglesTalks(events).catch(() => ({}));
  return (
    <>
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
  const count = (await listCategories().catch(() => [])).length;
  return (
    <>
      <h1 className="sr-only">{category.name} 방</h1>
      <div className="board-head singles-head">
        <span className="room-title">
          <span className="room-name">{category.name}</span>
        </span>
        <p className="room-desc">{category.description}</p>
      </div>
      <RoomTopBar count={count} />
      {category.slug === SINGLES_ROOM ? <SinglesTab /> : <p className="empty">이 방은 정보만 모아 보여 줘요.</p>}
    </>
  );
}

/** 👫 남녀 생각 차이 탭 (10/29): 최근 오늘의 썸 카톡 투표를 남녀로 나눠 (투표도 여기서) */
export async function SinglesGenderTab() {
  const polls = await recentRoomPolls(SINGLES_ROOM, 14).catch(() => []);
  if (!polls.length) return <p className="empty">아직 투표가 없어요. 매일 아침 8시에 오늘의 썸 카톡이 올라와요.</p>;
  return (
    <section className="gender-tab" aria-label="남녀 생각 차이">
      <p className="hint">투표할 때 &quot;나는 남/여&quot;를 고르면 남녀 결과가 따로 모여요. 남녀 각 {GENDER_MIN}명 이상이면 보여요.</p>
      {polls.map((p) => (
        <div key={p.id} className="come-back">
          <Link href={`/posts/${p.id}`}>
            <b>{p.title.replace(/^\[[^\]]+\]\s*/, "")}</b>
          </Link>
          <DebateVote postId={p.id} initial={p.tally} push={false} />
        </div>
      ))}
    </section>
  );
}

/** 📅 내 행사 달력 탭 (10/29): ⭐ 관심 행사만 (관심 표시는 브라우저에, 화면에서 거른다) */
export async function SinglesCalendarTab() {
  const today = todayKst();
  const events = await listSinglesEvents({ today }).catch(() => []);
  return <SinglesCalendar events={events.map(({ hidden: _h, ...e }) => e)} today={today} />;
}
