import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TypeTest } from "@/components/TypeTest";
import { typeTestCard, typeTestCardUrl, typeTestOf } from "@/lib/typeTests";

type Props = { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const toQuery = (sp: Record<string, string | string[] | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") q.set(k, v);
  return q;
};

/** 🧩 타입 테스트 주소 (/t/<key>). 궁합(?m=)·결과(?r=) 링크면 미리보기를 그 카드로, 검색에는 원래 주소만 */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const test = typeTestOf((await params).key);
  if (!test) return {};
  const q = toQuery(await searchParams);
  const card = typeTestCard(test, q);
  const shared = q.has("m") || q.has("r");
  const title = shared ? `${card.emoji} ${card.headline}` : `${test.emoji} ${test.title}`;
  const description = shared ? card.sub : test.description;
  const image = { url: typeTestCardUrl(test, q), width: 1200, height: 630 };
  return {
    title: `${test.title} · ${test.roomName}`,
    description: test.description,
    alternates: { canonical: `/t/${test.key}` },
    ...(shared ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export default async function Page({ params }: Props) {
  const test = typeTestOf((await params).key);
  if (!test) notFound();
  return <TypeTest test={test} />;
}
