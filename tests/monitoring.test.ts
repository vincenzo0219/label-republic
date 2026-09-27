import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { checkAdminAuth, isAdminPath } from "@/lib/admin-auth";
import { classifySource, isBot, kstDay, parsePath } from "@/lib/metrics";

describe("traffic source classification", () => {
  const site = "labelrepublic.kr";
  it("classifies landings by referrer host", () => {
    expect(classifySource({ landing: true, referrer: "https://www.google.co.kr/", siteHost: site }).source).toBe("search");
    expect(classifySource({ landing: true, referrer: "https://m.search.naver.com/search.naver?query=x", siteHost: site })).toEqual({ source: "search", host: "m.search.naver.com" });
    expect(classifySource({ landing: true, referrer: "https://t.co/abc", siteHost: site }).source).toBe("social");
    expect(classifySource({ landing: true, referrer: "https://blog.example.com/p", siteHost: site }).source).toBe("referral");
    expect(classifySource({ landing: true, referrer: "", siteHost: site }).source).toBe("direct");
    expect(classifySource({ landing: true, referrer: "not a url", siteHost: site }).source).toBe("direct");
    expect(classifySource({ landing: true, referrer: "https://labelrepublic.kr/c/pet-food", siteHost: site }).source).toBe("internal");
    expect(classifySource({ landing: false, referrer: "https://www.google.com/", siteHost: site }).source).toBe("internal");
    // 포트가 붙은 사이트 호스트도 내부 이동으로 인식
    expect(classifySource({ landing: true, referrer: "http://localhost:3100/search?q=x", siteHost: "localhost:3100" }).source).toBe("internal");
  });
  it("does not treat lookalike hosts as search engines", () => {
    expect(classifySource({ landing: true, referrer: "https://google.com.evil.io/", siteHost: site }).source).toBe("referral");
    expect(classifySource({ landing: true, referrer: "https://notnaver.com/", siteHost: site }).source).toBe("referral");
  });
  it("parses tracked paths and rejects internal/admin ones", () => {
    expect(parsePath("/posts/42")).toMatchObject({ postId: "42", categorySlug: null });
    expect(parsePath("/c/%EC%BB%A4%ED%94%BC")).toMatchObject({ categorySlug: "커피" });
    expect(parsePath("/search?q=%20마그네슘%20")).toMatchObject({ path: "/search", searchQuery: "마그네슘" });
    expect(parsePath("/admin")).toBeNull();
    expect(parsePath("/api/posts")).toBeNull();
    expect(parsePath("//evil.com/x")).toBeNull();
    expect(parsePath("https://evil.com/")).toBeNull();
  });
  it("filters bots and missing user agents", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBot("Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)")).toBe(true);
    expect(isBot(null)).toBe(true);
    expect(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1")).toBe(false);
  });
  it("uses Korean calendar days", () => {
    expect(kstDay(new Date("2026-09-27T14:59:00Z"))).toBe("2026-09-27");
    expect(kstDay(new Date("2026-09-27T15:00:00Z"))).toBe("2026-09-28");
  });
});

describe("admin auth", () => {
  const basic = (pw: string) => `Basic ${Buffer.from(`admin:${pw}`).toString("base64")}`;
  it("is disabled without a password and checks it otherwise", () => {
    expect(checkAdminAuth(basic("x"), undefined)).toBe("disabled");
    expect(checkAdminAuth(undefined, "s3cret-pass")).toBe("unauthorized");
    expect(checkAdminAuth(basic("wrong"), "s3cret-pass")).toBe("unauthorized");
    expect(checkAdminAuth(basic("s3cret-pass"), "s3cret-pass")).toBe("ok");
    expect(checkAdminAuth(`Basic ${Buffer.from("s3cret-pass").toString("base64")}`, "s3cret-pass")).toBe("unauthorized");
  });
  it("normalizes encoded, doubled and cased paths before gating", () => {
    for (const p of ["/admin", "/admin/", "/admin/x", "/%61dmin", "/%2561dmin".replace("%25", "%"), "//admin", "/ADMIN", "/api/admin/stats", "/%E0%A4%A"]) {
      expect(isAdminPath(p), p).toBe(true);
    }
    for (const p of ["/", "/administrator-guide", "/posts/1", "/api/posts"]) expect(isAdminPath(p), p).toBe(false);
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("monitoring (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const posts = await import("@/lib/repo/posts");
  const boards = await import("@/lib/repo/board-requests");
  const metrics = await import("@/lib/metrics");
  const dash = await import("@/lib/repo/metrics");
  const { runMaintenance, scanAbuse } = await import("@/lib/jobs/maintenance");

  const fp = (n: number | string) => String(n).padStart(64, "0");
  const newPost = (title = "테스트 글") =>
    posts.createPost({
      categorySlug: "supplements",
      nickname: "테스터",
      pin: "1234",
      title,
      body: "마그네슘 200mg 제품 비교 본문입니다.",
      summary: { lines: ["하나", "둘", "셋"], model: "author", isAuthorEdited: true },
      fingerprint: fp("author"),
    });
  const establish = (f: string) =>
    query("INSERT INTO fingerprints (fingerprint, first_seen, last_seen) VALUES ($1, now() - interval '3 days', now())", [f]);

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
    await query(
      "TRUNCATE posts, board_requests, fingerprints, abuse_alerts, maintenance_runs, page_views, visitors RESTART IDENTITY CASCADE",
    );
    await query("DELETE FROM categories WHERE auto_promoted_at IS NOT NULL");
  });

  afterAll(async () => {
    await pool().end();
  });

  it("tracks first activity per fingerprint across tables", async () => {
    const post = await newPost();
    await posts.votePost(post.id, fp(1), 1);
    await posts.reportPost(post.id, fp(2), "광고");
    const rows = await query<{ fingerprint: string }>("SELECT fingerprint FROM fingerprints ORDER BY fingerprint");
    expect(rows.map((r) => r.fingerprint)).toEqual([fp(1), fp(2), fp("author")].sort());
  });

  it("halves report weight for fresh fingerprints piling onto one post, not for established users", async () => {
    const post = await newPost();
    await establish(fp("old"));
    for (const n of [1, 2, 3]) await posts.reportPost(post.id, fp(n), "광고");
    await posts.reportPost(post.id, fp("old"), "광고");
    const w = await query<{ reporter_fingerprint: string; weight: number }>(
      "SELECT reporter_fingerprint, weight FROM reports WHERE post_id = $1 ORDER BY id",
      [post.id],
    );
    expect(w.map((r) => r.weight)).toEqual([1, 1, 0.5, 1]);
  });

  it("makes a coordinated burst of fresh reporters insufficient to blind on its own", async () => {
    const post = await newPost();
    for (let n = 1; n <= 7; n++) await posts.reportPost(post.id, fp(n), "광고");
    // 1 + 1 + 0.5 × 5 = 4.5 < 5
    expect((await posts.getPost(post.id))!.is_blinded).toBe(false);
    for (const n of ["e1", "e2"]) {
      await establish(fp(n));
      await posts.reportPost(post.id, fp(n), "광고");
    }
    expect((await posts.getPost(post.id))!.is_blinded).toBe(true);
  });

  it("does not down-weight fresh reporters on posts already flagged as likely spam", async () => {
    const spam = await posts.createPost({
      categorySlug: "supplements",
      nickname: "광고맨",
      pin: "1234",
      title: "최저가 공동구매",
      body: "문의주세요 010-1234-5678 오픈채팅 https://open.kakao.com/o/abc",
      summary: null,
    });
    expect(spam.is_suppressed).toBe(true);
    for (let n = 1; n <= 5; n++) await posts.reportPost(spam.id, fp(`s${n}`), "광고");
    expect((await posts.getPost(spam.id))!.is_blinded).toBe(true);
  });

  it("raises report/vote burst and mass-reporter alerts, upserting instead of duplicating", async () => {
    const target = await newPost("표적 글");
    for (let n = 1; n <= 5; n++) await posts.reportPost(target.id, fp(`r${n}`), "광고");
    const boosted = await newPost("부풀린 글");
    for (let n = 1; n <= 12; n++) await posts.votePost(boosted.id, fp(`v${n}`), 1);
    const others = await Promise.all(Array.from({ length: 11 }, (_, i) => newPost(`다른 글 ${i}`)));
    for (const o of others) await posts.reportPost(o.id, fp("mass"), "도배");

    const client = await pool().connect();
    try {
      const found = await scanAbuse(client);
      const kinds = found.map((a) => `${a.kind}:${a.subjectId}`);
      expect(kinds).toContain(`report_burst:${target.id}`);
      expect(kinds).toContain(`vote_burst:${boosted.id}`);
      expect(kinds).toContain(`mass_reporter:${fp("mass").slice(0, 12)}`);
      // 정상적인 소수 신고에는 알림 없음
      expect(kinds.filter((k) => k.startsWith("report_burst:")).length).toBe(1);

      await scanAbuse(client);
      const rows = await query<{ hits: number }>("SELECT hits FROM abuse_alerts");
      expect(rows.length).toBe(found.length);
      expect(rows.every((r) => r.hits === 1)).toBe(true); // 내용이 같으면 hits 증가 없음
    } finally {
      client.release();
    }
  });

  it("does not alert when established users vote heavily", async () => {
    const post = await newPost();
    for (let n = 1; n <= 12; n++) {
      await establish(fp(`u${n}`));
      await posts.votePost(post.id, fp(`u${n}`), 1);
    }
    const client = await pool().connect();
    try {
      expect((await scanAbuse(client)).filter((a) => a.kind === "vote_burst")).toHaveLength(0);
    } finally {
      client.release();
    }
  });

  it("defers board promotion until the minimum age, then promotes via maintenance", async () => {
    const req = await boards.createBoardRequest("커피 원두", "");
    await boards.voteBoardRequest(req.id, fp(1), 2, 24);
    const second = await boards.voteBoardRequest(req.id, fp(2), 2, 24);
    expect(second).toMatchObject({ promoted: false });
    expect(second.promotableAt).toBeTruthy();
    expect(second.request.status).toBe("open");

    expect(await boards.promotePendingBoardRequests(2, 24)).toEqual([{ id: req.id, outcome: "too_early" }]);
    const later = new Date(Date.now() + 25 * 3600_000);
    expect(await boards.promotePendingBoardRequests(2, 24, later)).toEqual([{ id: req.id, outcome: "promoted" }]);
    expect((await query("SELECT 1 FROM categories WHERE name = '커피 원두'")).length).toBe(1);
  });

  it("closes a request as duplicate if a same-named board appeared meanwhile", async () => {
    const req = await boards.createBoardRequest("캠핑 장비", "");
    await query("INSERT INTO categories (name, slug) VALUES ('캠핑 장비', 'camping')");
    await boards.voteBoardRequest(req.id, fp(1), 1, 0);
    const [row] = await query<{ status: string; slug: string }>(
      "SELECT r.status, c.slug FROM board_requests r JOIN categories c ON c.id = r.promoted_category_id WHERE r.id = $1",
      [req.id],
    );
    expect(row).toEqual({ status: "duplicate", slug: "camping" });
  });

  it("records page views, returning visitors, sources and post views", async () => {
    const post = await newPost("검색 유입 글");
    const vh = metrics.visitorHash("00000000-0000-4000-8000-000000000001");
    const day1 = new Date(Date.now() - 2 * 86400_000);
    const p = metrics.parsePath(`/posts/${post.id}`)!;
    expect(await metrics.recordPageView({ visitorHash: vh, path: p, source: "search", referrerHost: "www.google.com", landing: true, now: day1 })).toEqual({ isReturning: false });
    expect(await metrics.recordPageView({ visitorHash: vh, path: metrics.parsePath("/search?q=오메가3")!, source: "internal", referrerHost: null, landing: false, now: day1 })).toEqual({ isReturning: false });
    expect(await metrics.recordPageView({ visitorHash: vh, path: p, source: "direct", referrerHost: null, landing: true })).toEqual({ isReturning: true });
    const other = metrics.visitorHash("00000000-0000-4000-8000-000000000002");
    await metrics.recordPageView({ visitorHash: other, path: p, source: "search", referrerHost: "search.naver.com", landing: true });

    expect((await posts.getPost(post.id)) as unknown as { view_count?: number }).toBeTruthy();
    const [{ view_count }] = await query<{ view_count: number }>("SELECT view_count FROM posts WHERE id = $1", [post.id]);
    expect(view_count).toBe(3);

    const [v] = await query<{ visit_days: number }>("SELECT visit_days FROM visitors WHERE visitor_hash = $1", [vh]);
    expect(v!.visit_days).toBe(2);

    const series = await dash.dailySeries(7);
    expect(series).toHaveLength(7);
    expect(series.reduce((s, r) => s + r.page_views, 0)).toBe(4);
    expect(series.reduce((s, r) => s + r.search_landings, 0)).toBe(2);
    expect(series.at(-1)).toMatchObject({ page_views: 2, visitors: 2, returning_visitors: 1 });

    const today = metrics.kstDay();
    const weekAgo = metrics.kstDay(new Date(Date.now() - 6 * 86400_000));
    expect(await dash.periodVisitors(weekAgo, today)).toEqual({ visitors: 2, returning: 1 });
    expect(await dash.sourceBreakdown(weekAgo, today)).toEqual([
      { source: "search", landings: 2 },
      { source: "direct", landings: 1 },
    ]);
    expect((await dash.topSearchLandingPosts(weekAgo, today))[0]).toMatchObject({ id: post.id, n: 2 });
    expect(await dash.topInternalSearches(weekAgo, today)).toEqual([{ q: "오메가3", n: 1 }]);
  });

  it("runs maintenance under a lock and prunes old page views", async () => {
    const vh = metrics.visitorHash("00000000-0000-4000-8000-000000000003");
    await metrics.recordPageView({ visitorHash: vh, path: metrics.parsePath("/")!, source: "direct", referrerHost: null, landing: true, now: new Date(Date.now() - 500 * 86400_000) });
    await metrics.recordPageView({ visitorHash: vh, path: metrics.parsePath("/")!, source: "direct", referrerHost: null, landing: true });

    const other = await pool().connect();
    try {
      await other.query("SELECT pg_advisory_lock(4823003)");
      expect((await runMaintenance()).ran).toBe(false);
    } finally {
      await other.query("SELECT pg_advisory_unlock(4823003)");
      other.release();
    }
    const r = await runMaintenance();
    expect(r).toMatchObject({ ran: true, pruned: { pageViews: 1 } });
    expect((await query("SELECT 1 FROM page_views")).length).toBe(1);
    const [run] = await query<{ error: string | null; finished_at: string | null }>("SELECT error, finished_at FROM maintenance_runs ORDER BY id DESC LIMIT 1");
    expect(run).toMatchObject({ error: null });
    expect(run!.finished_at).toBeTruthy();
  });
});
