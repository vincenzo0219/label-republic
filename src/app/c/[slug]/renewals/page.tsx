import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { RenewalsView, renewalStatus } from "@/components/RenewalsView";
import { getCategoryBySlug as getCategoryUncached } from "@/lib/repo/categories";

export const dynamic = "force-dynamic";

const getCategoryBySlug = cache(getCategoryUncached);

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> };

function decodeSlug(raw: string) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = await getCategoryBySlug(decodeSlug((await params).slug));
  if (!category) return {};
  const base = `/c/${encodeURIComponent(category.slug)}/renewals`;
  return {
    title: `${category.name} 라벨 변경 이력`,
    description: `${category.name} 방에서 라벨 표시값이 바뀐 것으로 보이는 제품 기록`,
    alternates: { canonical: base, types: { "application/atom+xml": [{ url: `${base}.xml`, title: `${category.name} 라벨 변경 이력` }] } },
  };
}

export default async function BoardRenewalsPage({ params, searchParams }: Props) {
  const category = await getCategoryBySlug(decodeSlug((await params).slug));
  if (!category) notFound();
  const sp = await searchParams;
  return <RenewalsView category={category} status={renewalStatus(sp.status)} page={Math.min(500, Number(sp.page) || 1)} />;
}
