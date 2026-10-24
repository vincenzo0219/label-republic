import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
  return (
    <>
      <RoomMemory slug={category.slug} />
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
      <FeedView category={category} sort={sp.sort ? sortSchema.parse(sp.sort) : "latest"} page={Number(sp.page) || 1} type={postTypeFilterSchema.parse(sp.type)} head={head} sourced={sp.sourced === "1"} chat={chatProps} banner={bite ? <BookBite bite={bite} /> : !head && writingBox} lead={head ? writingBox : category.slug === "주식" && sp.type === "info" ? <Link href="/margin-calc" className="ear-banner mc-link">🧮 반대매매 계산기</Link> : null} />
    </>
  );
}
