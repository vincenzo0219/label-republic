import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { FeedView } from "@/components/FeedView";
import { getCategoryBySlug as getCategoryUncached } from "@/lib/repo/categories";
import { postTypeFilterSchema, sortSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

// generateMetadata 와 페이지가 같은 보드를 읽으므로 요청 하나 안에서는 한 번만 조회한다
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
    title: `${category.name} 보드`,
    description: `${category.name} — ${category.description} 방장 없이 검증되는 라벨공화국 정보 아카이브.`,
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
  return <FeedView category={category} sort={sortSchema.parse(sp.sort)} page={Number(sp.page) || 1} type={postTypeFilterSchema.parse(sp.type)} />;
}
