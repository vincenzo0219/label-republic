import { after } from "next/server";
import { json, parseBody, route } from "@/lib/http";
import { HttpError, tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { hit } from "@/lib/rate-limit";
import { getCategoryBySlug } from "@/lib/repo/categories";
import { aiModeratePost, createPost, listPosts } from "@/lib/repo/posts";
import { resolveSummary } from "@/lib/summary";
import { createPostSchema, sortSchema } from "@/lib/validation";

/** GET /api/posts?category=&sort=trust|latest|votes&q=&page= — 피드/검색 */
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
  });
  return json(result);
});

/** POST /api/posts — 게시글 작성 (nickname, pw, title, body, category, summary?, summaryToken?) */
export const POST = route(async (req) => {
  const fp = fingerprint(req.headers);
  if (!hit(`post:create:${fp}`, 10, 10 * 60 * 1000)) throw tooMany();
  const input = await parseBody(req, createPostSchema);
  const post = await createPost({
    categorySlug: input.category,
    nickname: input.nickname,
    pin: input.pw,
    title: input.title,
    body: input.body,
    summary: resolveSummary(input.summary, input.summaryToken),
    fingerprint: fp,
  });
  // 응답을 보낸 뒤 AI 스팸 분류로 규칙 기반 판정을 보정 (API 키가 있을 때만 동작)
  after(() => aiModeratePost(post.id).catch((err) => console.error("[moderation]", err)));
  return json({ post }, 201);
});
