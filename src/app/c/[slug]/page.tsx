import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FeedView } from "@/components/FeedView";
import { getCategoryBySlug } from "@/lib/repo/categories";
import { sortSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

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
    alternates: { canonical: `/c/${encodeURIComponent(category.slug)}` },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const category = await getCategoryBySlug(decodeSlug((await params).slug));
  if (!category) notFound();
  const sp = await searchParams;
  return <FeedView category={category} sort={sortSchema.parse(sp.sort)} page={Number(sp.page) || 1} />;
}
