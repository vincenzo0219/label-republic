/**
 * DB 통합 테스트 — TEST_DATABASE_URL 이 있을 때만 실행된다.
 * 매 실행마다 public 스키마를 비우고 마이그레이션을 새로 적용한다. (운영 DB를 가리키지 말 것)
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("database rules", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const posts = await import("@/lib/repo/posts");
  const comments = await import("@/lib/repo/comments");
  const boards = await import("@/lib/repo/board-requests");
  const { listCategories } = await import("@/lib/repo/categories");

  const fp = (n: number | string) => String(n).padStart(64, "0");
  const newPost = (slug = "supplements", title = "테스트 글 제목") =>
    posts.createPost({
      categorySlug: slug,
      nickname: "테스터",
      pin: "1234",
      title,
      body: "마그네슘 200mg. 아연 10mg. 비타민D 1000IU 포함.",
      summary: { lines: ["하나", "둘", "셋"], model: "author", isAuthorEdited: true },
    });

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      await query(readFileSync(path.join(dir, f), "utf8"));
    }
  });

  beforeEach(async () => {
    resetRateLimits();
    await query("TRUNCATE posts, board_requests RESTART IDENTITY CASCADE");
    await query("DELETE FROM categories WHERE auto_promoted_at IS NOT NULL");
    await query("UPDATE categories SET post_count = 0");
  });

  afterAll(async () => {
    await pool().end();
  });

  it("seeds the five initial boards", async () => {
    const cats = await listCategories();
    expect(cats.map((c) => c.slug)).toEqual(["supplements", "keyboards", "deskterior", "pet-food", "perfume-audio"]);
  });

  it("creates a post with its summary and keeps post_count in sync", async () => {
    const post = await newPost();
    expect(post.summary?.lines).toEqual(["하나", "둘", "셋"]);
    expect(post.trust_tier).toBe("pending");
    expect((await listCategories())[0]!.post_count).toBe(1);
    await posts.deletePost(post.id, fp(1), "1234");
    expect((await listCategories())[0]!.post_count).toBe(0);
  });

  it("rejects a wrong pin and rate-limits brute force", async () => {
    const post = await newPost();
    for (let i = 0; i < 5; i++) {
      await expect(posts.deletePost(post.id, fp(9), "0000")).rejects.toMatchObject({ status: 403 });
    }
    await expect(posts.deletePost(post.id, fp(9), "1234")).rejects.toMatchObject({ status: 429 });
  });

  it("allows one vote per fingerprint with toggle/switch semantics", async () => {
    const post = await newPost();
    expect(await posts.votePost(post.id, fp(1), 1)).toMatchObject({ upvotes: 1, downvotes: 0, myVote: 1 });
    expect(await posts.votePost(post.id, fp(1), 1)).toMatchObject({ upvotes: 0, downvotes: 0, myVote: 0 });
    expect(await posts.votePost(post.id, fp(1), -1)).toMatchObject({ upvotes: 0, downvotes: 1, myVote: -1 });
    expect(await posts.votePost(post.id, fp(1), 1)).toMatchObject({ upvotes: 1, downvotes: 0, myVote: 1 });
    expect(await posts.votePost(post.id, fp(2), 1)).toMatchObject({ upvotes: 2, downvotes: 0 });
  });

  it("auto-blinds after 5 distinct reporters, ignoring duplicates", async () => {
    const post = await newPost();
    for (let i = 1; i <= 4; i++) await posts.reportPost(post.id, fp(i), "광고");
    expect(await posts.reportPost(post.id, fp(4), "again")).toMatchObject({ report_count: 4, is_blinded: false, alreadyReported: true });
    expect(await posts.reportPost(post.id, fp(5), "광고")).toMatchObject({ report_count: 5, is_blinded: true });

    const detail = await posts.getPost(post.id);
    expect(detail?.body).toBe("");
    expect((await posts.listPosts({ sort: "latest" })).total).toBe(0);
    await expect(posts.votePost(post.id, fp(6), 1)).rejects.toMatchObject({ status: 410 });
    await expect(comments.createComment(post.id, { nickname: "댓글", pin: "1111", body: "hi" })).rejects.toMatchObject({ status: 410 });
  });

  it("assigns per-category trust tiers, leaving young/low-vote posts pending", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) ids.push((await newPost("keyboards", `키보드 글 ${i}`)).id);
    const other = await newPost("supplements", "영양제 글");
    await query("UPDATE posts SET created_at = now() - interval '2 days'");
    // 글 i 에 i+3 개의 추천 (모두 최소 투표수 3 이상)
    for (const [i, id] of ids.entries()) {
      await query(
        `INSERT INTO votes (post_id, voter_fingerprint, value) SELECT $1, lpad(g::text, 64, '0'), 1 FROM generate_series(1, $2) g`,
        [id, i + 3],
      );
    }
    await query("SELECT refresh_trust_tiers(2)");
    const tier = async (id: string) => (await posts.getPost(id))!.trust_tier;
    expect(await tier(ids[19]!)).toBe("top5"); // percent_rank 0
    expect(await tier(ids[18]!)).toBe("top12"); // 1/19 ≈ 0.053
    expect(await tier(ids[17]!)).toBe("top12"); // 2/19 ≈ 0.105
    expect(await tier(ids[16]!)).toBe("top19"); // 3/19 ≈ 0.158
    expect(await tier(ids[15]!)).toBe("none"); // 4/19 ≈ 0.21
    expect(await tier(other.id)).toBe("pending"); // 다른 카테고리, 투표 없음

    const young = await newPost("keyboards", "새 글");
    for (let v = 1; v <= 30; v++) await posts.votePost(young.id, fp(`y${v}`), 1);
    expect(await tier(young.id)).toBe("pending"); // 24시간 미만

    const feed = await posts.listPosts({ categoryId: 2, sort: "trust" });
    expect(feed.items[0]!.id).toBe(ids[19]);
  });

  it("searches with AND across terms and escapes LIKE wildcards", async () => {
    await newPost("supplements", "마그네슘 비교");
    await newPost("keyboards", "적축 스위치 100%");
    expect((await posts.listPosts({ sort: "latest", q: "마그네슘 200mg" })).total).toBe(2); // 본문 공통
    expect((await posts.listPosts({ sort: "latest", q: "마그네슘 비교" })).total).toBe(1);
    expect((await posts.listPosts({ sort: "latest", q: "100%" })).total).toBe(1);
    expect((await posts.listPosts({ sort: "latest", q: "%" })).total).toBe(1);
    expect((await posts.listPosts({ sort: "latest", q: "_" })).total).toBe(0);
  });

  it("promotes a board request to a category exactly once at the threshold", async () => {
    const req = await boards.createBoardRequest("커피 원두", "로스팅 정보");
    await expect(boards.createBoardRequest("커피 원두", "")).rejects.toMatchObject({ status: 409 });
    await expect(boards.createBoardRequest("데스크테리어", "")).rejects.toMatchObject({ status: 409 });

    expect(await boards.voteBoardRequest(req.id, fp(1), 3)).toMatchObject({ promoted: false });
    expect(await boards.voteBoardRequest(req.id, fp(1), 3)).toMatchObject({ alreadyVoted: true });
    // 동시 투표에서도 승격은 한 번만
    const results = await Promise.all([fp(2), fp(3), fp(4)].map((f) => boards.voteBoardRequest(req.id, f, 3)));
    expect(results.filter((r) => r.promoted)).toHaveLength(1);
    const final = results.find((r) => r.promoted)!.request;
    expect(final).toMatchObject({ status: "promoted", vote_count: 3, promoted_category_slug: "커피-원두" });
    const cats = await listCategories();
    expect(cats.find((c) => c.slug === "커피-원두")?.auto_promoted_at).toBeTruthy();
  });

  it("maintains comment_count and enforces the comment pin", async () => {
    const post = await newPost();
    const c = await comments.createComment(post.id, { nickname: "댓글러", pin: "4321", body: "좋은 정보" });
    expect((await posts.getPost(post.id))!.comment_count).toBe(1);
    await expect(comments.deleteComment(c.id, fp(1), "0000")).rejects.toMatchObject({ status: 403 });
    await comments.deleteComment(c.id, fp(1), "4321");
    expect((await posts.getPost(post.id))!.comment_count).toBe(0);
  });
});
