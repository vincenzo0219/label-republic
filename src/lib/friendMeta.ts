import type { Metadata } from "next";
import { friendCard, friendCardUrl, type FriendTestKey } from "./friendLink";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * 🤝 대결·궁합 링크로 들어오면 링크 미리보기(카톡·OG)를 친구 기록 카드로 바꾼다. 아니면 원래 메타데이터 그대로.
 * canonical 은 그대로 두어 검색 결과에는 원래 테스트 주소만 남는다.
 */
export async function friendMetadata(base: Metadata, test: FriendTestKey, searchParams: SearchParams): Promise<Metadata> {
  const sp = await searchParams;
  const card = friendCard(test, sp);
  if (!card) return base;
  const title = `${card.emoji} ${card.headline}`;
  const image = { url: friendCardUrl(test, sp), width: 1200, height: 630 };
  return {
    ...base,
    robots: { index: false, follow: true },
    openGraph: { ...base.openGraph, title, description: card.sub, images: [image] },
    twitter: { card: "summary_large_image", title, description: card.sub, images: [image.url] },
  };
}
