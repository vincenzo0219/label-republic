import type { MetadataRoute } from "next";
import { config } from "@/lib/config";
import { listCategories } from "@/lib/repo/categories";
import { listPostIdsForSitemap } from "@/lib/repo/posts";
import { listProductIdsForSitemap } from "@/lib/repo/products";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, posts, products] = await Promise.all([listCategories(), listPostIdsForSitemap(), listProductIdsForSitemap()]);
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
  ];
}
