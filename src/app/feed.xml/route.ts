import { config } from "@/lib/config";
import { atomResponse, buildAtom } from "@/lib/feed";
import { listFeedPosts } from "@/lib/repo/posts";

export const dynamic = "force-dynamic";

/** GET /feed.xml — 전체 보드 최신 정보·정모 글 */
export async function GET() {
  const posts = await listFeedPosts();
  return atomResponse(
    buildAtom({
      id: `${config.siteUrl}/feed.xml`,
      title: "라벨공화국 — 전체 보드",
      subtitle: "방장 없는 성분·취미 팩트체크 커뮤니티의 새 글",
      selfUrl: `${config.siteUrl}/feed.xml`,
      siteUrl: config.siteUrl,
      alternateUrl: `${config.siteUrl}/`,
      posts,
    }),
  );
}
