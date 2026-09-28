import { after } from "next/server";
import { json, parseBody, route } from "@/lib/http";
import { withIdempotency } from "@/lib/idempotency";
import { HttpError, tooMany } from "@/lib/errors";
import { fingerprint, networkHash } from "@/lib/fingerprint";
import { hit } from "@/lib/rate-limit";
import { getCategoryBySlug } from "@/lib/repo/categories";
import { aiModeratePost, createPost, listPosts } from "@/lib/repo/posts";
import { resolveSummary } from "@/lib/summary";
import { createPostSchema, postTypeFilterSchema, sortSchema } from "@/lib/validation";

/** GET /api/posts?category=&sort=trust|latest|votes&q=&page=&sourced=1 — 피드/검색 */
export const GET = route(async (req) => {
  const sp = new URL(req.url).searchParams;
  let categoryId: number | undefined;
  const slug = sp.get("category");
  if (slug) {
    const cat = await getCategoryBySlug(slug);
    if (!cat) throw new HttpError(400, "invalid_category", "존재하지 않는 카테고리입니다.");
    categoryId = cat.id;
  }
  const result = await listPosts({
    categoryId,
    sort: sortSchema.parse(sp.get("sort") ?? undefined),
    q: sp.get("q")?.slice(0, 100) ?? undefined,
    page: Number(sp.get("page")) || 1,
    type: postTypeFilterSchema.parse(sp.get("type") ?? undefined),
    sourced: sp.get("sourced") === "1",
  });
  return json(result);
});

/** POST /api/posts — 게시글 작성 (nickname, pw, title, body, category, summary?, summaryToken?) */
export const POST = route(async (req) => {
  const fp = fingerprint(req.headers);
  // 느린 망에서 같은 요청을 다시 보내도 한 번만 올라가게 (Idempotency-Key, Sprint 19)
  return withIdempotency(req, "post", async () => {
    if (!(await hit(`post:create:${fp}`, 10, 10 * 60 * 1000))) throw tooMany();
    if (!(await hit(`post:create-net:${networkHash(req.headers)}`, 30, 10 * 60 * 1000))) throw tooMany();
    const input = await parseBody(req, createPostSchema);
    if (input.postType === "meetup") {
      if (!input.meetup) throw new HttpError(400, "invalid_input", "정모 일시·장소·인원을 입력해주세요.");
      // 정모 제안은 하루 3건까지 (도배 방지)
      if (!(await hit(`meetup:create:${fp}`, 3, 24 * 60 * 60 * 1000))) throw tooMany();
    }
    const post = await createPost({
      categorySlug: input.category,
      nickname: input.nickname,
      pin: input.pw,
      title: input.title,
      body: input.body,
      summary: resolveSummary(input.summary, input.summaryToken),
      fingerprint: fp,
      network: networkHash(req.headers),
      postType: input.postType,
      meetup: input.postType === "meetup" ? input.meetup : undefined,
      images: input.images,
      sources: input.sources,
      products: input.products,
      facts: input.facts,
    });
    // 응답을 보낸 뒤 AI 스팸 분류로 규칙 기반 판정을 보정 (API 키가 있을 때만 동작)
    after(() => aiModeratePost(post.id).catch((err) => console.error("[moderation]", err)));
    return json({ post }, 201);
  });
});
