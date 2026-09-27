import type { MetadataRoute } from "next";
import { config } from "@/lib/config";
import { listCategories } from "@/lib/repo/categories";
import { listPostIdsForSitemap } from "@/lib/repo/posts";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, posts] = await Promise.all([listCategories(), listPostIdsForSitemap()]);
  // 광고 의심 글은 listPostIdsForSitemap 에서 제외된다
  return [
    { url: `${config.siteUrl}/`, changeFrequency: "hourly", priority: 1 },
    ...categories.map((c) => ({
      url: `${config.siteUrl}/c/${encodeURIComponent(c.slug)}`,
      changeFrequency: "hourly" as const,
      priority: 0.8,
    })),
    ...posts.map((p) => ({ url: `${config.siteUrl}/posts/${p.id}`, lastModified: p.updated_at, priority: 0.6 })),
  ];
}
