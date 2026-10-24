import Link from "next/link";
import { listPosts } from "@/lib/repo/posts";
import { INGREDIENT_ROOMS, listCategories, quietRoomSlugs, roomTools } from "@/lib/repo/categories";
import type { Category, PostType } from "@/lib/types";
import type { SortKey } from "@/lib/validation";
import { THIN_BOARD_POSTS } from "@/lib/onboarding";
import { boardNeeds } from "@/lib/repo/onboarding";
import { CategoryTabs } from "./CategoryTabs";
import { InterestToggle } from "./InterestToggle";
import { Pagination } from "./Pagination";
import { PostCard } from "./PostCard";
import { FilterCount, FilterCountsLoader, MarkSeen } from "./NewMarks";
import { SortBar } from "./SortBar";
import { NO_INFO_TAB, ROOM_CHAT_TABS, ROOM_TAB_LINKS, headLabel, tabHeadsFor, type Head } from "@/lib/heads";
import type { Comment } from "@/lib/types";
import { EventAlert } from "./EventAlert";
import { LiveComments } from "./LiveComments";
import { RoomVisitors } from "./RoomVisitors";
import { SeenTracker } from "./SeenTracker";
import { badgeOf, ROOM_BADGES, type BadgeMap } from "@/lib/badges";
import { badgesSafe } from "@/lib/repo/badges";

/** 홈 피드 / 카테고리 피드 공용 서버 컴포넌트 */
export async function FeedView({
  category,
  sort,
  page,
  type,
  sourced = false,
  humanFirst = false,
  head,
  chat,
  banner,
  lead,
  roomTab,
}: {
  category?: Category;
  sort: SortKey;
  page: number;
  type?: PostType;
  /** 출처가 달린 글만 */
  sourced?: boolean;
  humanFirst?: boolean;
  /** 방 안의 작은 방 (말머리, Sprint 86) */
  head?: Head;
  /** 💬 자유채팅 탭: 글 목록 대신 방 채팅(카톡형)을 보여 준다 */
  chat?: { postId: string; initial: Comment[]; badges?: BadgeMap };
  /** 방 이름 바로 아래, 탭 위 (책 덕후방: 📖 오늘 책 한입) */
  banner?: React.ReactNode;
  /** 탭 아래, 글 목록 위 (작가지망생방 📸 자랑: ✍️ 오늘 몇 자) */
  lead?: React.ReactNode;
  /** 💬 채팅 뒤 방 전용 탭 (육아방 📍동네 체험): 글 목록 대신 이 화면 */
  roomTab?: { key: string; node: React.ReactNode };
}) {
  // 글이 적은 방의 첫 화면(필터 없음)에만 안내 (Sprint 32) — boardNeeds 는 글 수부터 세고 많으면 바로 끝낸다 (Sprint 33)
  const guideCandidate = category && page === 1 && !type && !sourced && !head && !chat && !roomTab;
  const [categories, feed, needs, tools, quiet] = await Promise.all([
    listCategories(),
    chat || roomTab ? Promise.resolve(null) : listPosts({ categoryId: category?.id, sort, page, type, head, sourced, humanFirst, hotFirst: !type && !head && !sourced, hideHiddenRooms: !category }),
    guideCandidate ? boardNeeds(category.id) : Promise.resolve(null),
    category ? roomTools(category.id) : Promise.resolve(null),
    quietRoomSlugs().catch(() => new Set<string>()),
  ]);
  // 방 배지 (작가지망생방: 장르 작가 테스트 결과)
  const badges = category && feed && Object.hasOwn(ROOM_BADGES, category.slug) ? await badgesSafe(category.slug, feed.items.map((p) => p.nickname)) : undefined;
  const showGuide = category && needs && needs.infoPosts < THIN_BOARD_POSTS;
  const basePath = category ? `/c/${encodeURIComponent(category.slug)}` : "/";
  const typeParam: Record<string, string> = { ...(type ? { type } : {}), ...(head ? { head } : {}), ...(sourced ? { sourced: "1" } : {}) };
  const params: Record<string, string> = { ...typeParam, ...(sort === "trust" ? {} : { sort }) };
  const href = (t: PostType | undefined, src: boolean) => {
    const qs = new URLSearchParams({ ...(t ? { type: t } : {}), ...(src ? { sourced: "1" } : {}), ...(sort === "trust" ? {} : { sort }) }).toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const typeHref = (t?: PostType) => href(t, sourced);
  // 보고 있는 탭에서 바로 그 탭 글쓰기 — 말머리·글 유형을 미리 골라 둔다
  const writeHref = `/write?${new URLSearchParams({
    ...(category ? { category: category.slug } : {}),
    ...(head ? { head } : type && type !== "chat" ? { type } : {}),
  })}`;
  const writeLabel = head
    ? `${headLabel(head, category?.slug)} 글쓰기`
    : type === "info" ? "📋 정보 글쓰기" : type === "meetup" ? "📅 정모 제안하기" : "✍️ 글쓰기";
  const seenRoom = category?.slug ?? "all";
  return (
    <>
      <h1 className="sr-only">{category ? `${category.name} 방` : "노방장 — 방장 없는 덕후 커뮤니티"}</h1>
      {/* 방 안에서는 다른 방 목록을 숨긴다 — 방 이름과 홈으로 가는 길만 */}
      {!category && <CategoryTabs categories={categories} active={undefined} quiet={[...quiet]} />}
      {category && (
        <div className="board-head">
          <span className="room-title">
            <Link href="/?all=1" className="room-name">← {category.name}</Link>
            <RoomVisitors slug={category.slug} />
          </span>
          <div className="board-actions">
            {/* 데이터가 있을 때만 (Sprint 42) */}
            {tools?.products && (
              <Link className="btn btn-sm" href={`${basePath}/products`}>
                🏷 제품별
              </Link>
            )}
            {tools?.facts && (
              <Link className="btn btn-sm" href={`${basePath}/facts`}>
                {INGREDIENT_ROOMS.has(category.slug) ? "🧪 성분별" : "📏 스펙별"}
              </Link>
            )}
            {tools?.renewals && (
              <Link className="btn btn-sm" href={`${basePath}/renewals`}>
                🔄 라벨 변경
              </Link>
            )}
            <InterestToggle slug={category.slug} name={category.name} />
          </div>
        </div>
      )}
      {banner}
      {category && (
      <nav className="type-filter" aria-label="글 유형">
        <FilterCountsLoader room={category.slug} />
        {/* 방 탭 (10/21 단순화): 전체 · 채팅 · 말머리 · (정보) — 정모·잡담 탭은 없음 */}
        <Link href={basePath} aria-current={!type && !head && !chat && !roomTab ? "true" : undefined} rel="nofollow">전체</Link>
        <Link href={`${basePath}?tab=chat`} aria-current={chat ? "true" : undefined} rel="nofollow">
          💬 채팅
          <FilterCount k="chat" />
        </Link>
        {(ROOM_CHAT_TABS[category.slug] ?? []).map((t) => (
          <Link key={t.key} href={`${basePath}?tab=${t.key}`} aria-current={roomTab?.key === t.key ? "true" : undefined} rel="nofollow">
            {t.label}
          </Link>
        ))}
        {tabHeadsFor(category.slug).map((h) => (
          <Link key={h.key} href={`${basePath}?${new URLSearchParams({ head: h.key })}`} aria-current={head === h.key ? "true" : undefined} rel="nofollow">
            {h.label}
            <FilterCount k={h.key} />
          </Link>
        ))}
        {(ROOM_TAB_LINKS[category.slug] ?? []).map((l) => (
          <Link key={l.href} href={l.href}>{l.label}</Link>
        ))}
        {!NO_INFO_TAB.has(category.slug) && (
          <Link href={typeHref("info")} aria-current={type === "info" && !head && !chat && !roomTab ? "true" : undefined} rel="nofollow">
            📋 정보
            <FilterCount k="info" />
          </Link>
        )}
        {sourced && (
          <Link className="filter-toggle" href={href(type, false)} aria-current="true" rel="nofollow">
            📚 출처 있는 글만 ✕
          </Link>
        )}
      </nav>
      )}
      {chat ? (
        <LiveComments postId={chat.postId} initial={chat.initial} casual chat badges={chat.badges} />
      ) : roomTab ? (
        roomTab.node
      ) : feed && (
      <>
      {lead}
      {/* 머리글에 글쓰기가 없어서 (어제 방문자 자리) 목록 위 이 버튼 하나가 글쓰기 */}
      {(
        <Link className="btn btn-primary tab-write" href={writeHref}>
          {writeLabel}
        </Link>
      )}
      {category && head === "행사" && <EventAlert slug={category.slug} />}
      {/* 방 안에서는 정렬 버튼 없이 최신순 (10/21 단순화) */}
      {!category && <SortBar basePath={basePath} params={typeParam} sort={sort} total={feed.total} />}
      {feed.items.length === 0 ? (
        <div className="empty">
          <p>
            {type === "meetup"
              ? "아직 제안된 정모가 없습니다."
              : type === "chat"
                ? "아직 잡담이 없습니다. 가볍게 첫 인사를 남겨 보세요."
                : showGuide
                  ? "아직 글이 없습니다. 위의 예시로 첫 글을 시작해 보세요."
                  : category
                    ? "아직 글이 없습니다. 이 방의 첫 글을 남겨 주세요."
                    : "아직 글이 없어요. 첫 글을 남기거나, 이야기하고 싶은 주제의 방을 만들어 보세요."}
          </p>
          <div className="empty-actions">
            {!category && (
              <Link className="btn btn-sm" href="/boards">
                🏠 방 만들기
              </Link>
            )}
          </div>
        </div>
      ) : (
        feed.items.map((post) => <PostCard key={post.id} post={post} showCategory={!category} seenRoom={seenRoom} inHead={!!head} badge={badgeOf(badges, post.nickname)} />)
      )}
      {page === 1 && !type && !sourced && <MarkSeen room={seenRoom} />}
      <SeenTracker key={`${basePath}?${new URLSearchParams(params)}`} />
      <Pagination basePath={basePath} params={params} page={feed.page} pageSize={feed.pageSize} total={feed.total} />
      </>
      )}
    </>
  );
}
