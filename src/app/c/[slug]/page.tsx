import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import Link from "next/link";
import { FeedView } from "@/components/FeedView";
import { BOOK_ROOM_SLUG } from "@/lib/books";
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
  const feed = <FeedView category={category} sort={sortSchema.parse(sp.sort)} page={Number(sp.page) || 1} type={postTypeFilterSchema.parse(sp.type)} sourced={sp.sourced === "1"} />;
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
  // 책방에서는 책 카드로 (Sprint 62) — 이야기는 방에서, 기록은 책 카드에 쌓인다
  return (
    <>
      <div className="ear-banners">
        <Link href="/first-line-test" className="ear-banner">
          <span className="ear-banner-emoji" aria-hidden>
            📜
          </span>
          <span>
            <b>첫 문장 테스트</b> — 첫 문장만 보고 무슨 책인지 알아요? (어렵습니다) <span className="ear-banner-go">1분 테스트 →</span>
          </span>
        </Link>
        <Link href="/books" className="ear-banner">
          <span className="ear-banner-emoji" aria-hidden>
            📖
          </span>
          <span>
            <b>책 카드</b> — 읽는 중·완독·중도 포기를 한 번에 남기고, 완독률과 다음 책을 확인해요 <span className="ear-banner-go">책 카드 →</span>
          </span>
        </Link>
        <Link href="/books/ask" className="ear-banner">
          <span className="ear-banner-emoji" aria-hidden>
            📚
          </span>
          <span>
            <b>상황별 추천</b> — &ldquo;○○할 때 읽을 책&rdquo;, 추천이 밀려 사라지지 않고 쌓여요 <span className="ear-banner-go">추천 →</span>
          </span>
        </Link>
      </div>
      {feed}
    </>
  );
}
