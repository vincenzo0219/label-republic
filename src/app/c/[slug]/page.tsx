import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import Link from "next/link";
import { FeedView } from "@/components/FeedView";
import { BOOK_ROOM_SLUG } from "@/lib/books";
import { ReadingNow } from "@/components/ReadingNow";
import { RoomPoll } from "@/components/RoomPoll";
import { ROOM_POLLS } from "@/lib/roomPolls";
import { DEBATE_ROOM_SLUG } from "@/lib/debate";
import { getCategoryBySlug as getCategoryUncached } from "@/lib/repo/categories";
import { postTypeFilterSchema, sortSchema } from "@/lib/validation";

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

export default async function CategoryPage({ params, searchParams }: Props) {
  const category = await getCategoryBySlug(decodeSlug((await params).slug));
  if (!category) notFound();
  const sp = await searchParams;
  const feed = (
    <>
      <div className="ear-banners">
        <Link href={`/c/${encodeURIComponent(category.slug)}/chat`} className="ear-banner">
          <span className="ear-banner-emoji" aria-hidden>
            💬
          </span>
          <span>
            <b>{category.name} 수다방</b> — 가입 없이 한 줄씩 편하게 <span className="ear-banner-go">들어가기 →</span>
          </span>
        </Link>
      </div>
      {ROOM_POLLS[category.slug] && <RoomPoll slug={category.slug} />}
      <FeedView category={category} sort={sortSchema.parse(sp.sort)} page={Number(sp.page) || 1} type={postTypeFilterSchema.parse(sp.type)} sourced={sp.sourced === "1"} />
    </>
  );
  // AI 덕후방에서는 AI 판별 테스트로 (Sprint 68)
  if (category.slug === "ai-덕후방")
    return (
      <>
        <div className="ear-banners">
          <Link href="/ai-test" className="ear-banner">
            <span className="ear-banner-emoji" aria-hidden>
              🤖
            </span>
            <span>
              <b>AI 판별 테스트</b> — 진짜 시인 vs AI, 진짜를 골라낼 수 있어요? <span className="ear-banner-go">1분 테스트 →</span>
            </span>
          </Link>
        </div>
        {feed}
      </>
    );
  // AI 토론방: 내 AI 에이전트 참가 (Sprint 71)
  if (category.slug === DEBATE_ROOM_SLUG)
    return (
      <>
        <div className="ear-banners">
          <a href="/agents.md" className="ear-banner">
            <span className="ear-banner-emoji" aria-hidden>
              🤖
            </span>
            <span>
              <b>내 AI도 토론에 참가</b> — 내 AI에게 nobangjang.com/agents.md 를 읽게 하세요 <span className="ear-banner-go">안내서 →</span>
            </span>
          </a>
        </div>
        {feed}
      </>
    );
  // 비바리움 방: 1분 테스트가 입구 (Sprint 83, 방 기본 세트)
  if (category.slug === "비바리움-덕후방")
    return (
      <>
        <div className="ear-banners">
          <Link href="/vivarium-test" className="ear-banner">
            <span className="ear-banner-emoji" aria-hidden>
              🦎
            </span>
            <span>
              <b>우리 집에서 키울 수 있을까?</b> — 질문 4개로 나에게 맞는 첫 생물 <span className="ear-banner-go">1분 테스트 →</span>
            </span>
          </Link>
        </div>
        {feed}
      </>
    );
  // 키보드 방에서는 타자 테스트로 (Sprint 67)
  if (category.slug === "keyboards")
    return (
      <>
        <div className="ear-banners">
          <Link href="/typing-test" className="ear-banner">
            <span className="ear-banner-emoji" aria-hidden>
              ⌨️
            </span>
            <span>
              <b>한글 타자 테스트</b> — 1분에 몇 타? 기록과 쓰는 키보드·축을 남겨요 <span className="ear-banner-go">1분 테스트 →</span>
            </span>
          </Link>
        </div>
        {feed}
      </>
    );
  if (category.slug !== BOOK_ROOM_SLUG) return feed;
  // 책방: 상황별 추천이 입구 (Sprint 76 — 독서 단톡방에서 가장 많이 오가는 말이 "추천"), 그다음 책 카드·첫 문장
  return (
    <>
      <ReadingNow limit={5} />
      <div className="ear-banners">
        <Link href="/books/ask" className="ear-banner">
          <span className="ear-banner-emoji" aria-hidden>
            📚
          </span>
          <span>
            <b>이럴 때 읽을 책</b> — 관계에 지칠 때, 혼자 있고 싶을 때… <span className="ear-banner-go">추천 보기 →</span>
          </span>
        </Link>
        <Link href="/books" className="ear-banner">
          <span className="ear-banner-emoji" aria-hidden>
            📖
          </span>
          <span>
            <b>지금 몇 쪽?</b> — 읽는 중·완독·포기를 남기고, 다들 어디서 멈추는지 봐요 <span className="ear-banner-go">책 카드 →</span>
          </span>
        </Link>
        <Link href="/first-line-test" className="ear-banner">
          <span className="ear-banner-emoji" aria-hidden>
            📜
          </span>
          <span>
            <b>첫 문장 테스트</b> — 첫 문장만 보고 무슨 책? <span className="ear-banner-go">1분 →</span>
          </span>
        </Link>
      </div>
      {feed}
    </>
  );
}
