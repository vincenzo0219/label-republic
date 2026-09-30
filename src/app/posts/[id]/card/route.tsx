import { config } from "@/lib/config";
import { getPost } from "@/lib/repo/posts";
import { CARD_SIZES, renderPostCard, type CardFormat } from "@/lib/og/card";

/**
 * GET /posts/:id/card?format=og|square — 3줄 요약 카드뷰 PNG
 * og(1200×630)는 링크 미리보기용 OG 이미지, square(1080×1080)는 SNS 이미지 공유용.
 * 블라인드·광고 의심 글은 이미지로 확산되지 않도록 만들지 않는다.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const post = await getPost(id);
  if (!post || post.is_blinded || post.is_suppressed) return new Response("Not found", { status: 404 });
  const f = new URL(req.url).searchParams.get("format");
  const format: CardFormat = f && f in CARD_SIZES ? (f as CardFormat) : "og";
  return renderPostCard(post, format, new URL(config.siteUrl).host);
}
