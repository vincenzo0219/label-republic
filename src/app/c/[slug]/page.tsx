import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import Link from "next/link";
import { FeedView } from "@/components/FeedView";
import { BOOK_ROOM_SLUG } from "@/lib/books";
import { RoomPoll } from "@/components/RoomPoll";
import { ROOM_POLLS } from "@/lib/roomPolls";
import { parseHead } from "@/lib/heads";
import { RoomMemory } from "@/components/RoomMemory";
import { BookBite } from "@/components/BookBite";
import { todayBite } from "@/lib/repo/bookBites";
import { listComments } from "@/lib/repo/comments";
import { ensureRoomChat } from "@/lib/repo/roomChat";
import { DEBATE_ROOM_SLUG } from "@/lib/debate";
import { getCategoryBySlug as getCategoryUncached } from "@/lib/repo/categories";
import { postTypeFilterSchema, sortSchema } from "@/lib/validation";
import { WritingLog } from "@/components/WritingLog";
import { badgesSafe } from "@/lib/repo/badges";
import { recentWriting, weeklyWriters } from "@/lib/repo/writingLog";
import { WRITING_ROOMS } from "@/lib/writingLog";
import { SavingsLog } from "@/components/SavingsLog";
import { MarketCard } from "@/components/MarketCard";
import { savingsSummary } from "@/lib/repo/savingsLog";
import { upcomingEvents } from "@/lib/repo/marketEvents";
import { SAVINGS_ROOMS } from "@/lib/savingsLog";
import { MealLog } from "@/components/MealLog";
import { mealSummary } from "@/lib/repo/mealLog";
import { DIET_ROOMS } from "@/lib/dietRoom";
import { MARKET_ROOMS } from "@/lib/marketEvents";
import { RadarCard } from "@/components/RadarCard";
import { RADAR_ROOMS } from "@/lib/marketRadar";
import { getRadar } from "@/lib/repo/marketRadar";
import { ALL_TAB, ROOM_DEFAULT_TAB, roomTabOf } from "@/lib/heads";
import { FanDays } from "@/components/FanDays";
import { TodayCards } from "@/components/TodayCards";
import { GIG_TAB, JOB_TAB, LESSON_TAB } from "@/lib/instructorRoom";
import { GigBoard } from "@/components/GigBoard";
import { KIDS_ROOM, KIDS_TAB } from "@/lib/kidsPrograms";
import { KidsTab } from "@/components/KidsTab";
import { KidsTopLine } from "@/components/KidsTopLine";
import { AdSchedule } from "@/components/AdSchedule";
import { isAdLanding } from "@/lib/adSchedule";
import { recentEventPosts } from "@/lib/repo/adSchedule";
import { InfoOnlyRoom, SinglesTab } from "@/components/InfoOnlyRoom";
import { BriefingStrip } from "@/components/BriefingStrip";
import { BRIEFING_KINDS, roomBriefings } from "@/lib/repo/briefings";
import { SINGLES_TAB } from "@/lib/singlesEvents";

/** ✍️ 오늘 몇 자 (작가지망생방): 이번 주 순위 + 어제·오늘 인증 + 배지. 실패하면 안 보인다 */
async function loadWriting(slug: string) {
  try {
    const [top, recent] = await Promise.all([weeklyWriters(slug), recentWriting(slug)]);
    const badges = await badgesSafe(slug, [...top.map((t) => t.nickname), ...recent.map((r) => r.nickname)]);
    return { top, recent, badges };
  } catch {
    return null;
  }
}

export const dynamic = "force-dynamic";

// generateMetadata 와 페이지가 같은 방을 읽으므로 요청 하나 안에서는 한 번만 조회한다
const getCategoryBySlug = cache(getCategoryUncached);

function decodeSlug(raw: string) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = await getCategoryBySlug(decodeSlug((await params).slug));
  if (!category) return {};
  // 정보만 보여 주는 방: 설명 그대로 (긴 줄표 없이)
  if (category.info_only)
    return { title: category.name, description: category.description, alternates: { canonical: `/c/${encodeURIComponent(category.slug)}` } };
  return {
    title: `${category.name} 방`,
    description: `${category.name} — ${category.description} 방장 없이 검증되는 노방장 정보 아카이브.`,
    alternates: {
      canonical: `/c/${encodeURIComponent(category.slug)}`,
      types: { "application/atom+xml": [{ url: `/c/${encodeURIComponent(category.slug)}/feed.xml`, title: `${category.name} 새 글` }] },
    },
  };
}

/** 방 입구 바로가기 — 설명 없이 짧은 이름만 (Sprint 89, 사용자 10/19 "안내글·설명 최소화") */
const ROOM_LINKS: Record<string, { href: string; label: string }[]> = {
  "ai-덕후방": [{ href: "/ai-test", label: "🤖 AI 판별 테스트" }],
  [DEBATE_ROOM_SLUG]: [{ href: "/agents.md", label: "🤖 내 AI 참가" }, { href: "/debate-test", label: "⚖️ 1분 테스트" }],
  "비바리움-덕후방": [{ href: "/vivarium-test", label: "🦎 1분 테스트" }, { href: "/viv-test", label: "🌿 타입 테스트" }],
  "비건-덕후방": [{ href: "/vegan-test", label: "🌱 1분 테스트" }],
  "k리그-덕후방": [{ href: "/fan-test", label: "⚽ 1분 테스트" }],
  "kbo-덕후방": [{ href: "/kbo-test", label: "⚾ 1분 테스트" }],
  "러닝-덕후방": [{ href: "/run-test", label: "🏃 1분 테스트" }],
  "요가-필라테스-덕후방": [{ href: "/yoga-test", label: "🧘 1분 테스트" }],
  "신발-덕후방": [{ href: "/shoe-test", label: "👟 1분 테스트" }],
  "게임-덕후방": [{ href: "/game-test", label: "🎮 1분 테스트" }],
  "드라마-덕후방": [{ href: "/drama-test", label: "📺 1분 테스트" }],
  "커피-덕후방": [{ href: "/coffee-test", label: "☕ 1분 테스트" }],
  "애니-만화-덕후방": [{ href: "/anime-test", label: "🎨 1분 테스트" }],
  "와인-위스키-덕후방": [{ href: "/wine-test", label: "🍷 1분 테스트" }],
  "육아-덕후방": [{ href: "/parent-test", label: "👶 1분 테스트" }],
  "작가지망생방": [{ href: "/writer-test", label: "✍️ 1분 테스트" }],
  "반려견-덕후방": [{ href: "/dog-test", label: "🐶 1분 테스트" }],
  keyboards: [{ href: "/typing-test", label: "⌨️ 타자 테스트" }],
  // 책 덕후방은 위 버튼 없이 (추천은 탭으로, 10/21 단순화)
};

export default async function CategoryPage({ params, searchParams }: Props) {
  const category = await getCategoryBySlug(decodeSlug((await params).slug));
  if (!category) notFound();
  // 💳 넣어둬 댓글이 사는 숨은 방 (102): 방 화면 대신 넣어둬로
  if (category.slug === "neo") redirect("/neo");
  // 정보만 보여 주는 방 (092): 글 목록·글쓰기·채팅 탭 없이 정보만. 💌 미혼남녀 만남 행사 방은 098 부터 다른 방처럼 (💌 만남 행사 탭이 기본)
  if (category.info_only) return <InfoOnlyRoom category={category} />;
  const sp = await searchParams;
  // 💬 수다방은 방 탭의 "자유채팅"으로 옮김
  const links = ROOM_LINKS[category.slug] ?? [];
  const bite = category.slug === BOOK_ROOM_SLUG && !sp.tab ? await todayBite().catch(() => null) : null;
  const chat = sp.tab === "chat" ? await ensureRoomChat(category.slug) : null;
  const initial = chat ? await listComments(chat.postId) : [];
  const chatProps = chat ? { postId: chat.postId, initial, badges: await badgesSafe(category.slug, initial.map((c) => c.nickname)) } : undefined;
  const head = parseHead(sp.head);
  const writing = WRITING_ROOMS.has(category.slug) && !sp.tab && !sp.type && (!head || head === "자랑") ? await loadWriting(category.slug) : null;
  const writingBox = writing && <WritingLog room={category.slug} {...writing} compact={!head} />;
  // 💰 이번 달 적립 (적립식 투자방) · 📅 오늘 밤 미국장 (미국주식방·주식). 실패하면 안 보인다
  const plain = !sp.tab && !sp.type;
  const savings = SAVINGS_ROOMS.has(category.slug) && plain && (!head || head === "자랑") ? await savingsSummary(category.slug).catch(() => null) : null;
  const savingsBox = savings && <SavingsLog room={category.slug} {...savings} compact={!head} />;
  // 🥗 오늘 식단 인증 (다이어트 식단 방). 실패하면 안 보인다
  const meal = DIET_ROOMS.has(category.slug) && plain && (!head || head === "자랑") ? await mealSummary(category.slug).catch(() => null) : null;
  const mealBox = meal && <MealLog room={category.slug} {...meal} compact={!head} />;
  // 🎫 광고(?from=ig_*)로 들어오면 맨 위에 가까운 일정 한 장 — 투자방은 📅 일정 카드, 육아방은 📍 동네 체험 한 줄을 그 자리로 (10/24)
  const ad = isAdLanding(sp.from);
  const markets = MARKET_ROOMS[category.slug];
  const events = markets && (ad || (plain && (!head || head === "행사"))) ? await upcomingEvents(markets).catch(() => null) : null;
  const adTop = !ad
    ? null
    : markets
      ? events && <MarketCard events={events} />
      : category.slug === KIDS_ROOM
        ? <KidsTopLine />
        : <AdSchedule posts={await recentEventPosts(category.id).catch(() => [])} slug={category.slug} />;
  const marketBox = events && !ad && plain && (!head || head === "행사") && <MarketCard events={events} />;
  const radar = RADAR_ROOMS.has(category.slug) && plain && !head ? await getRadar(category.slug).catch(() => null) : null;
  const marketBoxes = (radar || marketBox) && (
    <>
      {radar && <RadarCard radar={radar} />}
      {marketBox}
    </>
  );
  // 📰 오늘 브리핑 (10/27): 주식·미국주식·적립식 방 맨 위 한 줄
  const briefings = plain && BRIEFING_KINDS[category.slug] ? await roomBriefings(category.slug).catch(() => []) : [];
  const baseBox = writingBox || savingsBox || mealBox || marketBoxes;
  const roomBox = briefings.length ? (
    <>
      <BriefingStrip items={briefings} />
      {baseBox}
    </>
  ) : (
    baseBox
  );
  // 📍 동네 체험 (육아방): 💬 채팅 뒤 탭 + 전체 탭 맨 위 한 줄. 지역은 브라우저에 저장돼 있어 화면에서 불러온다
  // 강사방: 탭 없이 들어오면 📋 대강·구인, 전체 글은 ?tab=all (10/25)
  const defaultTab = ROOM_DEFAULT_TAB[category.slug];
  const tabKey = sp.tab === ALL_TAB ? undefined : (sp.tab ?? (defaultTab && !sp.head && !sp.type && !sp.sourced && !sp.page ? defaultTab : undefined));
  const roomTab = roomTabOf(category.slug, tabKey);
  const roomTabProps =
    roomTab?.key === KIDS_TAB
      ? { key: KIDS_TAB, node: <KidsTab /> }
      : roomTab?.key === GIG_TAB
        ? { key: GIG_TAB, node: <GigBoard kind="sub" offToken={sp.u?.slice(0, 60)} /> }
        : roomTab?.key === JOB_TAB
          ? { key: JOB_TAB, node: <GigBoard kind="job" offToken={sp.u?.slice(0, 60)} /> }
          : roomTab?.key === LESSON_TAB
            ? { key: LESSON_TAB, node: <GigBoard kind="ask" /> }
            : roomTab?.key === SINGLES_TAB
              ? { key: SINGLES_TAB, node: <SinglesTab /> }
        : undefined;
  const kidsLine = !ad && category.slug === KIDS_ROOM && plain && !head && !roomTab && (Number(sp.page) || 1) === 1 ? <KidsTopLine /> : null;
  // 🎉 내 덕질 기념일 (10/26): 📸 자랑 탭에는 카드, 전체 탭 첫 페이지에는 작게. 숨긴 방·만남 연결 기능 없는 방(098)은 빼고 (정보만 보여 주는 방은 위에서 이미 끝)
  const fanDays = (compact: boolean) => (category.is_hidden || category.no_matching ? null : <FanDays slug={category.slug} roomName={category.name} compact={compact} />);
  const fanLine = !kidsLine && plain && !head && !roomTab && (Number(sp.page) || 1) === 1 ? fanDays(true) : null;
  return (
    <>
      <RoomMemory slug={category.slug} />
      {adTop}
      {/* 🎉 오늘 축하할 덕후 (10/26): 오늘 올라온 기념일·응원 카드, 줄 안에서 바로 누른다 */}
      {!sp.tab && !sp.type && !head && (Number(sp.page) || 1) === 1 && <TodayCards rooms={[category.slug]} />}
      {links.length > 0 && <nav className="room-links" aria-label="바로가기">
        {links.map((l) =>
          l.href.endsWith(".md") ? (
            <a key={l.href} href={l.href} className="chip">
              {l.label}
            </a>
          ) : (
            <Link key={l.href} href={l.href} className="chip">
              {l.label}
            </Link>
          ),
        )}
      </nav>}
      {ROOM_POLLS[category.slug] && <RoomPoll slug={category.slug} />}
      <FeedView category={category} sort={sp.sort ? sortSchema.parse(sp.sort) : "latest"} page={Number(sp.page) || 1} type={postTypeFilterSchema.parse(sp.type)} head={head} sourced={sp.sourced === "1"} chat={chatProps} banner={bite ? <BookBite bite={bite} /> : !head && roomBox} lead={head ? (head === "자랑" ? <>{roomBox}{fanDays(false)}</> : roomBox) : category.slug === "주식" && sp.type === "info" ? <Link href="/margin-calc" className="ear-banner mc-link">🧮 반대매매 계산기</Link> : (kidsLine ?? fanLine)} roomTab={roomTabProps} />
    </>
  );
}
