import Link from "next/link";
import { Fragment } from "react";
import { listPosts } from "@/lib/repo/posts";
import { INGREDIENT_ROOMS, listCategories, roomTools } from "@/lib/repo/categories";
import type { Category, PostType } from "@/lib/types";
import type { SortKey } from "@/lib/validation";
import { THIN_BOARD_POSTS } from "@/lib/onboarding";
import { boardNeeds } from "@/lib/repo/onboarding";
import { MyRoomStar } from "./MyRooms";
import { Pagination } from "./Pagination";
import { PostCard } from "./PostCard";
import { FilterCount, FilterCountsLoader, MarkSeen } from "./NewMarks";
import { SortBar } from "./SortBar";
import { roomRuleNotice } from "@/lib/singlesRules";
import { ALL_TAB, NO_INFO_TAB, headsFor, tabMembers, ROOM_DEFAULT_TAB, ROOM_TAB_LINKS, headLabel, roomTabsAround, tabHeadsFor, type Head } from "@/lib/heads";
import { pinnedTabFor, stripsHead } from "@/lib/shopRoom";
import type { Comment } from "@/lib/types";
import { EventAlert } from "./EventAlert";
import { CalendarSubscribe } from "./CalendarSubscribe";
import { CheerButton } from "./CheerButton";
import { LiveComments } from "./LiveComments";
import { RoomVisitors } from "./RoomVisitors";
import { SeenTracker } from "./SeenTracker";
import { badgeOf, ROOM_BADGES, type BadgeMap } from "@/lib/badges";
import { badgesSafe } from "@/lib/repo/badges";
import { ttlMemo } from "@/lib/ttlMemo";
import { eventDday, eventDdayLabel, sortByEventDday, type EventDday } from "@/lib/adSchedule";
import { eventBodies } from "@/lib/repo/adSchedule";
import { eventCardCounts } from "@/lib/repo/eventGoing";

// 방 상단 도구 유무·조용한 방 목록은 자주 바뀌지 않아 60초씩 재사용 (10/24 속도)
const cachedRoomTools = ttlMemo(roomTools, 60_000);
// 방 안 "☰ 다른 방 n개"용 공개 방 수
const cachedRoomCount = ttlMemo(async (_: number) => (await listCategories()).length, 60_000);
// 방 탭: 손가락이 닿는(hover·touchstart) 순간 그 탭 화면 전체를 미리 받는다. next/link 의 공개 타입에는 아직 없는 App Router 옵션
const PREFETCH_ON_TOUCH = { unstable_dynamicOnHover: true } as object;

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
  mine,
  onlyMine = false,
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
  /** 내 방 slug (쿠키) — 홈 탭에 ★, 내 방 먼저 */
  mine?: string[];
  /** 홈: 내 방 글만 */
  onlyMine?: boolean;
}) {
  // 글이 적은 방의 첫 화면(필터 없음)에만 안내 (Sprint 32) — boardNeeds 는 글 수부터 세고 많으면 바로 끝낸다 (Sprint 33)
  const guideCandidate = category && page === 1 && !type && !sourced && !head && !chat && !roomTab;
  const [feed, needs, tools, roomCount] = await Promise.all([
    chat || roomTab ? Promise.resolve(null) : listPosts({ categoryId: category?.id, categorySlugs: !category && onlyMine && mine?.length ? mine : undefined, sort, page, type, head, notHeads: type === "info" && !head && category ? headsFor(category.slug).flatMap((h) => tabMembers(h.key)) : undefined, sourced, humanFirst, hotFirst: !type && !head && !sourced, hideHiddenRooms: !category, pinnedTab: pinnedTabFor(category?.slug, { head, type, sourced }) }),
    guideCandidate ? boardNeeds(category.id) : Promise.resolve(null),
    category ? cachedRoomTools(category.id) : Promise.resolve(null),
    category ? cachedRoomCount(0).catch(() => 0) : Promise.resolve(0),
  ]);
  // 방 배지 (작가지망생방: 장르 작가 테스트 결과)
  const badges = category && feed && Object.hasOwn(ROOM_BADGES, category.slug) ? await badgesSafe(category.slug, feed.items.map((p) => p.nickname)) : undefined;
  const showGuide = category && needs && needs.infoPosts < THIN_BOARD_POSTS;
  // 🎫 [행사]·[혜택] 카드에 D-day (10/25): 이 페이지의 그런 글만 번호로 본문을 한 번 더 읽는다
  const eventIds = feed ? feed.items.filter((p) => /^\[(행사|혜택)\]/.test(p.title)).map((p) => p.id) : [];
  // 🙋 [행사] 카드: 같이 갈 사람 수 · 열린 동행 모집 수 (10/26)
  const goingIds = feed ? feed.items.filter((p) => p.title.startsWith("[행사]")).map((p) => p.id) : [];
  const [bodies, together] = await Promise.all([
    eventIds.length ? eventBodies(eventIds).catch(() => new Map<string, string>()) : null,
    goingIds.length ? eventCardCounts(goingIds).catch(() => new Map<string, { going: number; open: number }>()) : new Map<string, { going: number; open: number }>(),
  ]);
  const ddays = new Map<string, EventDday>(
    feed && bodies ? feed.items.filter((p) => bodies.has(p.id)).map((p) => [p.id, eventDday({ ...p, body: bodies.get(p.id)! })]) : [],
  );
  // 🎫 행사 탭은 가까운 일정 먼저, 끝난 행사는 맨 뒤 (페이지 안에서만 — 행사 글은 한 방에 한 페이지를 넘는 일이 드물다)
  const items = feed ? (category && head === "행사" ? sortByEventDday(feed.items, ddays) : feed.items) : [];
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
  const defaultTab = category ? ROOM_DEFAULT_TAB[category.slug] : undefined;
  // 💌 만남 행사 방 (098): 글쓰기·채팅 위 안전 안내 + 채팅 한 줄마다 🚩 신고
  const ruleNotice = category ? roomRuleNotice(category.slug) : null;
  return (
    <>
      <h1 className="sr-only">{category ? `${category.name} 방` : "노방장: 같은 취향끼리 일정·정보·수다"}</h1>
      {/* 방 안에서는 다른 방 목록을 숨긴다 — 방 이름과 홈으로 가는 길만 */}
      {category && (
        <div className="board-head">
          <span className="room-title">
            <span className="room-name">{category.name}</span>
            <MyRoomStar slug={category.slug} />
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
          </div>
        </div>
      )}
      {banner}
      {category && (
      <nav className="type-filter" aria-label="글 유형">
        <FilterCountsLoader room={category.slug} />
        {/* 방 탭 (10/21 단순화): 전체 · 채팅 · 말머리 · (정보) — 정모·잡담 탭은 없음. 손가락이 닿는 순간 탭 내용을 미리 받는다 (10/24 속도) */}
        {/* 강사방처럼 기본 탭이 따로 있는 방은 그 탭이 맨 앞(주소 그대로), 전체는 맨 뒤 ?tab=all (10/25) */}
        {roomTabsAround(category.slug).before.map((t) => (
          <Link key={t.key} href={t.key === defaultTab ? basePath : `${basePath}?tab=${t.key}`} aria-current={roomTab?.key === t.key ? "true" : undefined} rel="nofollow" {...PREFETCH_ON_TOUCH}>
            {t.label}
          </Link>
        ))}
        {!defaultTab && <Link href={basePath} aria-current={!type && !head && !chat && !roomTab ? "true" : undefined} rel="nofollow" {...PREFETCH_ON_TOUCH}>전체</Link>}
        <Link href={`${basePath}?tab=chat`} aria-current={chat ? "true" : undefined} rel="nofollow" {...PREFETCH_ON_TOUCH}>
          💬 채팅
          <FilterCount k="chat" />
        </Link>
        {roomTabsAround(category.slug).after.map((t) => (
          <Link key={t.key} href={`${basePath}?tab=${t.key}`} aria-current={roomTab?.key === t.key ? "true" : undefined} rel="nofollow" {...PREFETCH_ON_TOUCH}>
            {t.label}
          </Link>
        ))}
        {tabHeadsFor(category.slug).map((h) => (
          <Link key={h.key} href={`${basePath}?${new URLSearchParams({ head: h.key })}`} aria-current={head === h.key ? "true" : undefined} rel="nofollow" {...PREFETCH_ON_TOUCH}>
            {h.label}
            <FilterCount k={h.key} />
          </Link>
        ))}
        {(ROOM_TAB_LINKS[category.slug] ?? []).map((l) => (
          <Link key={l.href} href={l.href}>{l.label}</Link>
        ))}
        {!NO_INFO_TAB.has(category.slug) && (
          <Link href={typeHref("info")} aria-current={type === "info" && !head && !chat && !roomTab ? "true" : undefined} rel="nofollow" {...PREFETCH_ON_TOUCH}>
            📋 정보
            <FilterCount k="info" />
          </Link>
        )}
        {defaultTab && <Link href={`${basePath}?tab=${ALL_TAB}`} aria-current={!type && !head && !chat && !roomTab ? "true" : undefined} rel="nofollow" {...PREFETCH_ON_TOUCH}>전체</Link>}
        {sourced && (
          <Link className="filter-toggle" href={href(type, false)} aria-current="true" rel="nofollow" {...PREFETCH_ON_TOUCH}>
            📚 출처 있는 글만 ✕
          </Link>
        )}
      </nav>
      )}
      {chat ? (
        <LiveComments postId={chat.postId} initial={chat.initial} casual chat badges={chat.badges} notice={ruleNotice} report={!!ruleNotice} />
      ) : roomTab ? (
        roomTab.node
      ) : feed && (
      <>
      {lead}
      {/* 머리글에 글쓰기가 없어서 (어제 방문자 자리) 목록 위 이 버튼 하나가 글쓰기 */}
      {ruleNotice && <p className="room-rule-note" role="note">{ruleNotice}</p>}
      {/* 홈에서는 큰 글쓰기 대신 맨 위 내 방·방 둘러보기가 첫 행동 (10/30 대표님 "네이버 카페·밴드처럼"). 글쓰기는 방 안에서 */}
      {category && (
        <Link className="btn btn-primary tab-write" href={writeHref}>
          {writeLabel}
        </Link>
      )}
      {category && head === "행사" && <EventAlert slug={category.slug} />}
      {/* 📅 웹 푸시가 안 닿는 폰도 달력 앱이 알려 주게 (10/26). 숨긴 방은 구독 달력에서 빠지므로 버튼도 없다 */}
      {category && head === "행사" && !category.is_hidden && <CalendarSubscribe room={category.slug} />}
      {/* 방 안에서는 정렬 버튼 없이 최신순 (10/21 단순화) */}
      {!category && <h2 className="feed-title">추천 글</h2>}
      {!category && <SortBar basePath={basePath} params={typeParam} sort={sort} total={feed.total} />}
      {items.length === 0 ? (
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
        items.map((post) => (
          <Fragment key={post.id}>
            <PostCard post={post} showCategory={!category} seenRoom={seenRoom} inHead={!!head || stripsHead(category?.slug)} badge={badgeOf(badges, post.nickname)} dday={eventDdayLabel(ddays.get(post.id) ?? null)} together={together.get(post.id)} />
            {/* 🎉 기념일·💪 응원 카드: 카드 바로 아래 버튼 하나 (카드 전체가 링크라 그 밖에 둔다, 10/26) */}
            {post.card_kind && <CheerButton postId={post.id} initial={post.cheer_count ?? 0} kind={post.card_kind} variant="card" />}
          </Fragment>
        ))
      )}
      {page === 1 && !type && !sourced && <MarkSeen room={seenRoom} />}
      <SeenTracker key={`${basePath}?${new URLSearchParams(params)}`} />
      <Pagination basePath={basePath} params={params} page={feed.page} pageSize={feed.pageSize} total={feed.total} />
      </>
      )}
    </>
  );
}
