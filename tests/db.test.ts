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
  const { runTrustBatch } = await import("@/lib/jobs/trust");
  const { runCuratorBatch } = await import("@/lib/jobs/curator");
  const curator = await import("@/lib/curator");

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
    await query("TRUNCATE posts, board_requests, trust_batch_runs, curator_queue, curator_runs RESTART IDENTITY CASCADE");
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
    expect(await runTrustBatch()).toMatchObject({ ran: true, categories: 5 });
    const tier = async (id: string) => (await posts.getPost(id))!.trust_tier;
    expect(await tier(ids[19]!)).toBe("top5"); // percent_rank 0
    expect(await tier(ids[18]!)).toBe("top12"); // 1/19 ≈ 0.053
    expect(await tier(ids[17]!)).toBe("top12"); // 2/19 ≈ 0.105
    expect(await tier(ids[16]!)).toBe("top19"); // 3/19 ≈ 0.158
    expect(await tier(ids[15]!)).toBe("none"); // 4/19 ≈ 0.21
    expect(await tier(other.id)).toBe("pending"); // 다른 카테고리, 투표 없음

    const young = await newPost("keyboards", "새 글");
    for (let v = 1; v <= 30; v++) await posts.votePost(young.id, fp(`y${v}`), 1);
    await runTrustBatch();
    expect(await tier(young.id)).toBe("pending"); // 24시간 미만

    const feed = await posts.listPosts({ categoryId: 2, sort: "trust" });
    expect(feed.items[0]!.id).toBe(ids[19]);
  });

  it("does not re-tier on the vote path; the batch picks it up", async () => {
    const post = await newPost();
    await query("UPDATE posts SET created_at = now() - interval '2 days'");
    for (let v = 1; v <= 3; v++) await posts.votePost(post.id, fp(v), 1);
    expect((await posts.getPost(post.id))!.trust_tier).toBe("pending");
    await runTrustBatch();
    expect((await posts.getPost(post.id))!.trust_tier).toBe("top5");
  });

  it("skips the trust batch while another instance holds the lock, and logs runs", async () => {
    const other = await pool().connect();
    try {
      await other.query("SELECT pg_advisory_lock(4823001)");
      expect(await runTrustBatch()).toEqual({ ran: false, categories: 0, changed: 0 });
    } finally {
      await other.query("SELECT pg_advisory_unlock(4823001)");
      other.release();
    }
    expect((await runTrustBatch()).ran).toBe(true);
    const runs = await query<{ finished_at: string | null; error: string | null }>("SELECT finished_at, error FROM trust_batch_runs");
    expect(runs).toHaveLength(1);
    expect(runs[0]!.finished_at).toBeTruthy();
    expect(runs[0]!.error).toBeNull();
  });

  it("down-weights reports from a mass-reporting fingerprint", async () => {
    const abuser = fp("abuser");
    for (let i = 0; i < 10; i++) await posts.reportPost((await newPost("keyboards", `다른 글 ${i}`)).id, abuser, "도배");
    const target = await newPost();
    await posts.reportPost(target.id, abuser, "광고");
    const w = await query<{ weight: number }>("SELECT weight FROM reports WHERE post_id = $1", [target.id]);
    expect(w[0]!.weight).toBeCloseTo(0.2);

    for (let i = 1; i <= 4; i++) await posts.reportPost(target.id, fp(i), "광고");
    // 고유 신고자 5명이지만 가중치 합 4.2 < 5 → 아직 블라인드 아님
    expect(await posts.reportPost(target.id, fp(4), "dup")).toMatchObject({ report_count: 5, is_blinded: false });
    expect(await posts.reportPost(target.id, fp(5), "광고")).toMatchObject({ report_count: 6, is_blinded: true });
  });

  it("suppresses spammy posts: sorted last, no trust badge, flagged in detail", async () => {
    const good = await newPost("supplements", "정상 글");
    const spam = await posts.createPost({
      categorySlug: "supplements",
      nickname: "광고맨",
      pin: "1234",
      title: "최저가 공동구매 진행",
      body: "문의주세요 010-1234-5678 오픈채팅 https://open.kakao.com/o/abc 할인코드 SALE",
      summary: null,
    });
    expect(spam.is_suppressed).toBe(true);
    expect(spam.moderation_note).toContain("메신저 유도");
    const feed = await posts.listPosts({ sort: "latest" });
    expect(feed.items.map((p) => p.id)).toEqual([good.id, spam.id]);

    await query("UPDATE posts SET created_at = now() - interval '2 days'");
    for (let v = 1; v <= 10; v++) await posts.votePost(spam.id, fp(v), 1);
    await runTrustBatch();
    expect((await posts.getPost(spam.id))!.trust_tier).toBe("none");

    // 수정으로 광고 문구를 걷어내면 규칙 판정이 다시 계산된다
    const fixed = await posts.updatePost(spam.id, fp(1), "1234", { body: "마그네슘 200mg 제품 두 개를 비교해봤습니다." , title: "마그네슘 비교" });
    expect(fixed.is_suppressed).toBe(false);
  });

  it("matches updated_at at millisecond precision for the async moderation guard", async () => {
    const post = await newPost();
    const rows = await query("SELECT 1 FROM posts WHERE id = $1 AND date_trunc('milliseconds', updated_at) = $2::timestamptz", [
      post.id,
      post.updated_at,
    ]);
    expect(rows).toHaveLength(1);
    // API 키가 없으면 AI 판정은 건너뛴다
    expect(await posts.aiModeratePost(post.id)).toBeNull();
  });

  const seed = (key: string, category: string, phase: "launch" | "drip", extra: Partial<Parameters<typeof curator.seedPostSchema.parse>[0]> = {}) =>
    curator.seedPostSchema.parse({
      key,
      category,
      phase,
      title: `시드 ${key}`,
      body: "라벨을 읽는 법에 대한 정보 글입니다. ".repeat(6),
      summary: ["첫째 줄 요약", "둘째 줄 요약", "셋째 줄 요약"],
      comments: ["Q. 질문 / A. 답변", "Q. 질문2 / A. 답변2"],
      ...extra,
    });

  it("refuses unreviewed seeds unless explicitly allowed, and is idempotent", async () => {
    const seeds = [seed("s-launch", "supplements", "launch"), seed("s-drip", "supplements", "drip", { reviewedBy: "검수자" })];
    const client = await pool().connect();
    try {
      const refused = await curator.importSeeds(client, seeds);
      expect(refused).toMatchObject({ published: 0, queued: 0, unreviewed: ["s-launch"] });
      expect((await posts.listPosts({ sort: "latest" })).total).toBe(0);

      expect(await curator.importSeeds(client, seeds, { allowUnreviewed: true, dryRun: true })).toMatchObject({ published: 1, queued: 1 });
      expect((await posts.listPosts({ sort: "latest" })).total).toBe(0); // dry run rolled back

      expect(await curator.importSeeds(client, seeds, { allowUnreviewed: true })).toMatchObject({ published: 1, queued: 1, skipped: 0 });
      await curator.importSeeds(client, [
        seed("s-first", "supplements", "launch", { priority: 1 }),
        seed("s-second", "supplements", "launch", { priority: 2 }),
      ], { allowUnreviewed: true });
      const latest = (await posts.listPosts({ sort: "latest" })).items.map((p) => p.title);
      expect(latest.slice(0, 2)).toEqual(["시드 s-first", "시드 s-second"]);
      expect(await curator.importSeeds(client, seeds, { allowUnreviewed: true })).toMatchObject({ published: 0, queued: 0, skipped: 2 });
      await expect(curator.importSeeds(client, [seed("bad-board", "no-such-board", "launch", { reviewedBy: "r" })])).rejects.toThrow(/unknown categories/);
    } finally {
      client.release();
    }
  });

  it("publishes curator posts transparently and locks them against PIN edits", async () => {
    const client = await pool().connect();
    try {
      await curator.importSeeds(client, [seed("s-ai", "keyboards", "launch", { reviewedBy: "r" })]);
    } finally {
      client.release();
    }
    const [card] = (await posts.listPosts({ sort: "latest" })).items;
    expect(card).toMatchObject({ is_ai_curated: true, nickname: curator.CURATOR_NICKNAME, comment_count: 2 });
    expect(card!.summary).toMatchObject({ model_version: "ai-curator", is_author_edited: false });
    const cs = await comments.listComments(card!.id);
    expect(cs.every((c) => c.is_ai_curated)).toBe(true);
    for (const pin of ["0000", "1234", "9999"]) {
      await expect(posts.deletePost(card!.id, fp(`p${pin}`), pin)).rejects.toMatchObject({ status: 403 });
    }
    await expect(comments.deleteComment(cs[0]!.id, fp(1), "0000")).rejects.toMatchObject({ status: 403 });
    // 일반 댓글은 AI 글에도 달 수 있다
    const human = await comments.createComment(card!.id, { nickname: "사람", pin: "1111", body: "출처 추가합니다" });
    expect(human.is_ai_curated).toBe(false);
  });

  it("drips queued posts per board and retreats as human posts grow", async () => {
    const client = await pool().connect();
    try {
      await curator.importSeeds(
        client,
        ["a", "b", "c"].flatMap((k) => [seed(`kb-${k}`, "keyboards", "drip", { reviewedBy: "r" }), seed(`pf-${k}`, "pet-food", "drip", { reviewedBy: "r" })]),
      );
    } finally {
      client.release();
    }
    const t0 = new Date();
    const first = await runCuratorBatch(t0);
    expect(first.published).toBe(2);
    expect(first.categories.find((c) => c.slug === "supplements")).toMatchObject({ reason: "queue empty" });

    // 12시간이 지나지 않았으면 게시하지 않는다
    expect((await runCuratorBatch(new Date(t0.getTime() + 3600_000))).published).toBe(0);
    const later = await runCuratorBatch(new Date(t0.getTime() + 13 * 3600_000));
    expect(later.published).toBe(2);

    // 키보드 보드에 사람 글이 20개 쌓이면 그 보드만 물러난다
    for (let i = 0; i < 20; i++) await newPost("keyboards", `사람 글 ${i}`);
    const retreat = await runCuratorBatch(new Date(t0.getTime() + 30 * 3600_000));
    expect(retreat.categories.find((c) => c.slug === "keyboards")).toMatchObject({ intervalHours: null, published: null });
    expect(retreat.categories.find((c) => c.slug === "pet-food")!.published).toBeTruthy();

    const runs = await query<{ published: number }>("SELECT published FROM curator_runs ORDER BY id");
    expect(runs.map((r) => r.published)).toEqual([2, 0, 2, 1]);
  });

  it("stops the curator after CURATOR_ACTIVE_UNTIL", async () => {
    const client = await pool().connect();
    try {
      await curator.importSeeds(client, [seed("late", "supplements", "drip", { reviewedBy: "r" })]);
    } finally {
      client.release();
    }
    process.env.CURATOR_ACTIVE_UNTIL = "2000-01-01T00:00:00Z";
    try {
      const r = await runCuratorBatch();
      expect(r.published).toBe(0);
      expect(r.categories[0]!.reason).toBe("active period ended");
    } finally {
      delete process.env.CURATOR_ACTIVE_UNTIL;
    }
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
