import { cookies, headers } from "next/headers";
import { ForgetRoom } from "@/components/RoomMemory";
import { getCategoryBySlug, listCategories } from "@/lib/repo/categories";
import { RoomGrid } from "@/components/RoomGrid";
import { MyRoomsBar } from "@/components/MyRooms";
import { MY_ROOMS_COOKIE, parseMyRoomsCookie } from "@/lib/myRooms";
import { FeedView } from "@/components/FeedView";
import { CRAWLER_HEADER } from "@/lib/fingerprint";
import { EarTestBanner } from "@/components/EarTestBanner";
import { MyRoomEvents } from "@/components/MyRoomEvents";
import { TodayCards } from "@/components/TodayCards";
import { RoomOpenedNotice } from "@/components/RoomOpenedNotice";
import { OpenVotesBanner } from "@/components/OpenVotesBanner";
import { RenewalsBanner } from "@/components/RenewalsBanner";
import { config } from "@/lib/config";
import { postTypeFilterSchema, sortSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

function safeDecode(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const crawler = (await headers()).get(CRAWLER_HEADER) === "1";
  // 다시 오면 마지막에 있던 방이 첫 화면 (Sprint 96). "전체 방 보기"(?all=1)로 오면 기억을 지운다
  const jar = await cookies();
  const last = jar.get("lr_room")?.value;
  // 내 방(nb_my, 브라우저 목록의 사본, 10/24). 서버에서 "마지막 방"으로 보내던 것(Sprint 96)은 내 방 규칙으로 바꿨다:
  // 방이 1개면 브라우저에서 그 방으로, 2개 이상이면 내 방 글만. 예전 쿠키는 처음 한 번 내 방을 채우는 데 쓴다
  const mine = crawler ? null : parseMyRoomsCookie(jar.get(MY_ROOMS_COOKIE)?.value);
  const legacy = !crawler && last && mine === null ? ((await getCategoryBySlug(safeDecode(last)).catch(() => null))?.slug ?? null) : null;
  const all = sp.all !== undefined;
  // 내 방이 2개 이상이면 홈은 내 방 글만 (전체는 /?all=1)
  const onlyMine = !all && (mine?.length ?? 0) >= 2;
  // ＋ 방 추가 창에 전체 방이 필요해서 늘 받는다
  const rooms = crawler ? [] : await listCategories().catch(() => []);
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
      {all && <ForgetRoom />}
      {/* 홈 맨 위 순서 (10/30 대표님 "네이버 카페·밴드처럼, 헷갈리지 않게"): 내 방 → 방 둘러보기 → 넣어둬·오늘의 문제 줄 → 추천 글 */}
      {!crawler && <MyRoomsBar rooms={rooms.map((r) => ({ slug: r.slug, name: r.name }))} initial={mine} legacy={legacy} filtered={onlyMine} redirect={!all} />}
      {/* 방 둘러보기는 내 방이 있어도 늘 (10/30 대표님 "방선택 8개를 하면, 아예 다른 방을 볼수가 없어") */}
      {!sp.page && <RoomGrid all={all} mine={mine ?? []} />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      {!sp.page && <EarTestBanner />}
      {onlyMine && !sp.page && mine && <MyRoomEvents rooms={mine} />}
      {!crawler && !sp.page && !!mine?.length && <TodayCards rooms={mine} showRoom={mine.length > 1} />}
      {!crawler && <RoomOpenedNotice />}
      <OpenVotesBanner />
      <RenewalsBanner />
      <FeedView humanFirst mine={mine ?? undefined} onlyMine={onlyMine} sort={sortSchema.parse(sp.sort)} page={Number(sp.page) || 1} type={postTypeFilterSchema.parse(sp.type)} sourced={sp.sourced === "1"} />
    </>
  );
}
