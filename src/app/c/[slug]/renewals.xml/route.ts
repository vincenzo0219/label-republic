import { config } from "@/lib/config";
import { atomResponse, buildRenewalAtom } from "@/lib/feed";
import { getCategoryBySlug } from "@/lib/repo/categories";
import { listRenewals } from "@/lib/repo/renewal-feed";

export const dynamic = "force-dynamic";

/** GET /c/:slug/renewals.xml — 방별 라벨 변경 (Sprint 28) */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  let slug = (await ctx.params).slug;
  try {
    slug = decodeURIComponent(slug);
  } catch {}
  const category = await getCategoryBySlug(slug);
  if (!category) return new Response("Not found", { status: 404 });
  const path = `/c/${encodeURIComponent(category.slug)}/renewals`;
  const { items } = await listRenewals({ status: "confirmed", categoryId: category.id, pageSize: 50 });
  return atomResponse(
    buildRenewalAtom({
      id: `${config.siteUrl}${path}.xml`,
      title: `노방장 — ${category.name} 라벨 변경 이력`,
      selfUrl: `${config.siteUrl}${path}.xml`,
      siteUrl: config.siteUrl,
      alternateUrl: `${config.siteUrl}${path}`,
      items,
    }),
  );
}
