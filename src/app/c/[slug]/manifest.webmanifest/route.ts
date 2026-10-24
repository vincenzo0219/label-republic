import { roomManifest } from "@/lib/manifest";
import { getCategoryBySlug } from "@/lib/repo/categories";

export const dynamic = "force-dynamic";

/** GET /c/:slug/manifest.webmanifest — 이 방에서 열리는 홈 화면 앱 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  let slug = (await ctx.params).slug;
  try {
    slug = decodeURIComponent(slug);
  } catch {}
  const room = await getCategoryBySlug(slug).catch(() => null);
  if (!room) return new Response("Not found", { status: 404 });
  return new Response(JSON.stringify(roomManifest(room)), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
