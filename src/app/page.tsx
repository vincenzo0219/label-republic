import { cookies, headers } from "next/headers";
import { FeedView } from "@/components/FeedView";
import { Welcome } from "@/components/Welcome";
import { CRAWLER_HEADER } from "@/lib/fingerprint";
import { WELCOME_COOKIE } from "@/lib/onboarding";
import { listCategories } from "@/lib/repo/categories";
import { siteStats } from "@/lib/repo/onboarding";
import { getBoardThreshold } from "@/lib/repo/board-requests";
import { PmfSurvey } from "@/components/PmfSurvey";
import { VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { PMF_COOKIE, surveyEligible } from "@/lib/repo/survey";
import { OpenVotesBanner } from "@/components/OpenVotesBanner";
import { RenewalsBanner } from "@/components/RenewalsBanner";
import { config } from "@/lib/config";
import { postTypeFilterSchema, sortSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  // 첫 방문 안내 (Sprint 32): 닫은 적이 없는 사람에게만, 첫 페이지에서만
  // 읽기 전용 모드 저장본(수집기 요청)에는 넣지 않는다 — 장애 중에는 글을 쓸 수 없고, 닫은 사람에게 다시 보이면 안 되므로 (Sprint 33)
  const crawler = (await headers()).get(CRAWLER_HEADER) === "1";
  const jar = await cookies();
  const firstVisit = !crawler && !jar.has(WELCOME_COOKIE) && !sp.page;
  // PMF 설문 (Sprint 40): 첫 방문 안내가 끝난 사람 중 3일 이상 온 사람에게만, 답하거나 닫기 전까지
  const vid = jar.get(VISITOR_COOKIE)?.value;
  const askSurvey =
    !crawler && !firstVisit && !sp.page && !jar.has(PMF_COOKIE) && !!vid && /^[0-9a-f-]{36}$/.test(vid)
      ? await surveyEligible(visitorHash(vid)).catch(() => false)
      : false;
  const [boards, stats, roomT] = firstVisit ? await Promise.all([listCategories(), siteStats(), getBoardThreshold()]) : [[], null, null];
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
      {firstVisit && stats && roomT && (
        <Welcome boards={boards.map((b) => ({ slug: b.slug, name: b.name }))} stats={stats} roomVotes={roomT.needed} />
      )}
      {askSurvey && <PmfSurvey cookieName={PMF_COOKIE} />}
      <OpenVotesBanner />
      <RenewalsBanner />
      <FeedView sort={sortSchema.parse(sp.sort)} page={Number(sp.page) || 1} type={postTypeFilterSchema.parse(sp.type)} sourced={sp.sourced === "1"} />
    </>
  );
}
