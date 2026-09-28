import type { MetadataRoute } from "next";
import { config } from "@/lib/config";
import { listCategories } from "@/lib/repo/categories";
import { listPostIdsForSitemap } from "@/lib/repo/posts";
import { listProductIdsForSitemap } from "@/lib/repo/products";
import { listBoardAttributes } from "@/lib/repo/facts";
import { topRenewalBrands } from "@/lib/repo/renewal-feed";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, posts, products, brands] = await Promise.all([
    listCategories(), listPostIdsForSitemap(), listProductIdsForSitemap(), topRenewalBrands({ limit: 500 }),
  ]);
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
    ...["/policy", "/rules", "/transparency", "/terms", "/privacy"].map((p) => ({ url: `${config.siteUrl}${p}`, changeFrequency: "monthly" as const, priority: 0.3 })),
    ...categories.map((c) => ({
      url: `${config.siteUrl}/c/${encodeURIComponent(c.slug)}`,
      changeFrequency: "hourly" as const,
      priority: 0.8,
    })),
    ...posts.map((p) => ({ url: `${config.siteUrl}/posts/${p.id}`, lastModified: p.updated_at, priority: 0.6 })),
    // 제품 페이지: 보이는 [정보]·[정모] 글이 있는 제품만
    ...products.map((p) => ({ url: `${config.siteUrl}/p/${p.id}`, lastModified: p.updated_at, priority: 0.7 })),
    ...ranks.map((url) => ({ url, changeFrequency: "daily" as const, priority: 0.6 })),
    // 라벨 변경 이력 (Sprint 28): 전체·보드별, 변경이 확인된 브랜드
    { url: `${config.siteUrl}/renewals`, changeFrequency: "daily" as const, priority: 0.6 },
    ...categories.map((c) => ({ url: `${config.siteUrl}/c/${encodeURIComponent(c.slug)}/renewals`, changeFrequency: "daily" as const, priority: 0.5 })),
    ...brands.map((b) => ({ url: `${config.siteUrl}/brand/${encodeURIComponent(b.key)}`, changeFrequency: "weekly" as const, priority: 0.5 })),
  ];
}
