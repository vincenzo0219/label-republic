import { cookies, headers } from "next/headers";
import { FeedView } from "@/components/FeedView";
import { CRAWLER_HEADER } from "@/lib/fingerprint";
import { ChatStarters } from "@/components/ChatStarters";
import { PmfSurvey } from "@/components/PmfSurvey";
import { EarTestBanner } from "@/components/EarTestBanner";
import { RoomOpenedNotice } from "@/components/RoomOpenedNotice";
import { VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { PMF_COOKIE, visitorHomeState } from "@/lib/repo/survey";
import { OpenVotesBanner } from "@/components/OpenVotesBanner";
import { RenewalsBanner } from "@/components/RenewalsBanner";
import { config } from "@/lib/config";
import { postTypeFilterSchema, sortSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const crawler = (await headers()).get(CRAWLER_HEADER) === "1";
  const jar = await cookies();
  const vid = jar.get(VISITOR_COOKIE)?.value;
  const visitor = !crawler && !!vid && /^[0-9a-f-]{36}$/.test(vid) ? await visitorHomeState(visitorHash(vid)).catch(() => null) : null;
  // PMF 설문 (Sprint 40): 3일 이상 온 사람에게만, 답하거나 닫기 전까지
  const askSurvey = !crawler && !sp.page && !jar.has(PMF_COOKIE) && !!visitor?.surveyOk;
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
      {!sp.page && <EarTestBanner />}
      {!crawler && <RoomOpenedNotice />}
      {askSurvey && <PmfSurvey cookieName={PMF_COOKIE} />}
      <OpenVotesBanner />
      <RenewalsBanner />
      {!sp.page && !sp.type && sp.sourced !== "1" && <ChatStarters />}
      <FeedView humanFirst sort={sortSchema.parse(sp.sort)} page={Number(sp.page) || 1} type={postTypeFilterSchema.parse(sp.type)} sourced={sp.sourced === "1"} />
    </>
  );
}
