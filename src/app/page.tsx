import { headers } from "next/headers";
import { FeedView } from "@/components/FeedView";
import { CRAWLER_HEADER } from "@/lib/fingerprint";
import { ChatStarters } from "@/components/ChatStarters";
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      {!crawler && !sp.page && <HomeNews />}
      {!sp.page && <EarTestBanner />}
      {!crawler && <RoomOpenedNotice />}
      <OpenVotesBanner />
      <RenewalsBanner />
      {!sp.page && !sp.type && sp.sourced !== "1" && <ChatStarters />}
      <FeedView humanFirst sort={sortSchema.parse(sp.sort)} page={Number(sp.page) || 1} type={postTypeFilterSchema.parse(sp.type)} sourced={sp.sourced === "1"} />
    </>
  );
}
