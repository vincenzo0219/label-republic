import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ForgetRoom } from "@/components/RoomMemory";
import { getCategoryBySlug } from "@/lib/repo/categories";
import { FeedView } from "@/components/FeedView";
import { CRAWLER_HEADER } from "@/lib/fingerprint";
import { EarTestBanner } from "@/components/EarTestBanner";
import { HomeNews } from "@/components/ReportLink";
import { RoomOpenedNotice } from "@/components/RoomOpenedNotice";
import { OpenVotesBanner } from "@/components/OpenVotesBanner";
import { RenewalsBanner } from "@/components/RenewalsBanner";
import { config } from "@/lib/config";
import { postTypeFilterSchema, sortSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const crawler = (await headers()).get(CRAWLER_HEADER) === "1";
  // 다시 오면 마지막에 있던 방이 첫 화면 (Sprint 96). "전체 방 보기"(?all=1)로 오면 기억을 지운다
  const last = (await cookies()).get("lr_room")?.value;
  // 유입 꼬리표(source·from·utm)만 붙은 첫 화면도 방으로
  const plain = Object.keys(sp).every((k) => k === "source" || k === "from" || k.startsWith("utm_"));
  if (last && !crawler && plain) {
    const room = await getCategoryBySlug(decodeURIComponent(last)).catch(() => null);
    if (room) redirect(`/c/${encodeURIComponent(room.slug)}`);
  }
  // PMF 설문 카드는 뺐다 (Sprint 78, 효과 없음)
  // 검색엔진 사이트 이름·사이트 내 검색창(SearchAction)용 구조화 데이터
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "노방장",
    alternateName: ["노방장", "Label Republic"],
    url: `${config.siteUrl}/`,
    inLanguage: "ko-KR",
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${config.siteUrl}/search?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
  return (
    <>
      {sp.all !== undefined && <ForgetRoom />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      {!crawler && !sp.page && <HomeNews />}
      {!sp.page && <EarTestBanner />}
      {!crawler && <RoomOpenedNotice />}
      <OpenVotesBanner />
      <RenewalsBanner />
      <FeedView humanFirst sort={sortSchema.parse(sp.sort)} page={Number(sp.page) || 1} type={postTypeFilterSchema.parse(sp.type)} sourced={sp.sourced === "1"} />
    </>
  );
}
