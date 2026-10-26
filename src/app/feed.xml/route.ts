import { config } from "@/lib/config";
import { atomResponse, buildAtom } from "@/lib/feed";
import { listFeedPosts } from "@/lib/repo/posts";

export const dynamic = "force-dynamic";

/** GET /feed.xml — 전체 방 최신 정보·정모 글 */
export async function GET() {
  const posts = await listFeedPosts();
  return atomResponse(
    buildAtom({
      id: `${config.siteUrl}/feed.xml`,
      title: "노방장 — 전체 방",
      subtitle: "노방장 새 글: 내 취향 일정, 놓치지 않게",
      selfUrl: `${config.siteUrl}/feed.xml`,
      siteUrl: config.siteUrl,
      alternateUrl: `${config.siteUrl}/`,
      posts,
    }),
  );
}
