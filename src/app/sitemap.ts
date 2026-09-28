import type { MetadataRoute } from "next";
import { config } from "@/lib/config";
import { listCategories } from "@/lib/repo/categories";
import { listPostIdsForSitemap } from "@/lib/repo/posts";
import { listProductIdsForSitemap } from "@/lib/repo/products";
import { listBoardAttributes } from "@/lib/repo/facts";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, posts, products] = await Promise.all([listCategories(), listPostIdsForSitemap(), listProductIdsForSitemap()]);
  // 성분 순위 페이지: 제품 3개 이상이 수치를 가진 항목만
  const ranks = (
    await Promise.all(
      categories.map(async (c) =>
        (await listBoardAttributes(c.id))
          .filter((a) => a.products >= 3)
          .slice(0, 50)
          .map((a) => `${config.siteUrl}/c/${encodeURIComponent(c.slug)}/facts?attr=${encodeURIComponent(a.attr_key)}`),
      ),
    )
  ).flat();
  // 광고 의심 글은 listPostIdsForSitemap 에서 제외된다
  return [
    { url: `${config.siteUrl}/`, changeFrequency: "hourly", priority: 1 },
    ...["/policy", "/transparency", "/terms", "/privacy"].map((p) => ({ url: `${config.siteUrl}${p}`, changeFrequency: "monthly" as const, priority: 0.3 })),
    ...categories.map((c) => ({
      url: `${config.siteUrl}/c/${encodeURIComponent(c.slug)}`,
      changeFrequency: "hourly" as const,
      priority: 0.8,
    })),
    ...posts.map((p) => ({ url: `${config.siteUrl}/posts/${p.id}`, lastModified: p.updated_at, priority: 0.6 })),
    // 제품 페이지: 보이는 [정보]·[정모] 글이 있는 제품만
    ...products.map((p) => ({ url: `${config.siteUrl}/p/${p.id}`, lastModified: p.updated_at, priority: 0.7 })),
    ...ranks.map((url) => ({ url, changeFrequency: "daily" as const, priority: 0.6 })),
  ];
}
