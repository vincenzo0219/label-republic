import { config } from "@/lib/config";
import { atomResponse, buildAtom } from "@/lib/feed";
import { getCategoryBySlug } from "@/lib/repo/categories";
import { listFeedPosts } from "@/lib/repo/posts";

export const dynamic = "force-dynamic";

/** GET /c/:slug/feed.xml — 방별 최신 정보·정모 글 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  let slug = (await ctx.params).slug;
  try {
    slug = decodeURIComponent(slug);
  } catch {}
  const category = await getCategoryBySlug(slug);
  if (!category) return new Response("Not found", { status: 404 });
  const path = `/c/${encodeURIComponent(category.slug)}`;
  return atomResponse(
    buildAtom({
      id: `${config.siteUrl}${path}/feed.xml`,
      title: `노방장 — ${category.name}`,
      subtitle: category.description,
      selfUrl: `${config.siteUrl}${path}/feed.xml`,
      siteUrl: config.siteUrl,
      alternateUrl: `${config.siteUrl}${path}`,
      posts: await listFeedPosts(category.id),
    }),
  );
}
