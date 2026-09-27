import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { checkEnv } from "@/lib/env-check";

describe("startup env check", () => {
  const good = {
    DATABASE_URL: "postgres://u:p@db/x",
    APP_SECRET: "Zq3v9Lk2Xw8Rt5Yb1Nm7Hc4Jd6Fg0Ps2Qa9Ue5",
    SITE_URL: "https://labelrepublic.kr",
    CONTACT_EMAIL: "privacy@labelrepublic.kr",
    ADMIN_PASSWORD: "a-long-admin-password",
    TRUST_PROXY: "true",
    ANTHROPIC_API_KEY: "sk-ant-x",
  };
  it("passes a complete production config", () => {
    expect(checkEnv(good, true)).toEqual({ errors: [], warnings: [] });
  });
  it("blocks production on missing or weak critical settings", () => {
    const r = checkEnv({ ...good, APP_SECRET: "short", SITE_URL: "http://localhost:3000", CONTACT_EMAIL: "" }, true);
    expect(r.errors.join("\n")).toMatch(/APP_SECRET 은 32자/);
    expect(r.errors.join("\n")).toMatch(/https/);
    expect(r.errors.join("\n")).toMatch(/localhost/);
    expect(r.errors.join("\n")).toMatch(/CONTACT_EMAIL/);
  });
  it("rejects placeholder secrets and short admin passwords", () => {
    expect(checkEnv({ ...good, APP_SECRET: "change-me-to-a-long-random-string-please" }, true).errors).toHaveLength(1);
    expect(checkEnv({ ...good, ADMIN_PASSWORD: "short" }, true).errors).toHaveLength(1);
  });
  it("only warns in development and for optional features", () => {
    const r = checkEnv({}, false);
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(3);
    const prod = checkEnv({ ...good, ANTHROPIC_API_KEY: "", ADMIN_PASSWORD: "", TRUST_PROXY: "" }, true);
    expect(prod.errors).toEqual([]);
    expect(prod.warnings).toHaveLength(3);
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("legal hold and transparency (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const posts = await import("@/lib/repo/posts");
  const legal = await import("@/lib/repo/legal");
  const { runMaintenance } = await import("@/lib/jobs/maintenance");

  const fp = (n: number | string) => String(n).padStart(64, "0");
  const newPost = () =>
    posts.createPost({
      categorySlug: "supplements",
      nickname: "작성자",
      pin: "1234",
      title: "문제 제기된 글",
      body: "특정인을 지목한 내용이 담긴 글이라고 가정합니다.",
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
    await resetRateLimits();
    await query("TRUNCATE posts, moderation_log, fingerprints, visitors RESTART IDENTITY CASCADE");
  });

  afterAll(async () => {
    await pool().end();
  });

  it("hides a held post everywhere, logs it publicly, and blocks double holds", async () => {
    const post = await newPost();
    await legal.applyLegalHold(post.id, "defamation", "소명 접수");
    const held = (await posts.getPost(post.id))!;
    expect(held).toMatchObject({ is_blinded: true, legal_hold: true, legal_hold_reason: "defamation", body: "" });
    expect((await posts.listPosts({ sort: "latest" })).total).toBe(0);
    await expect(posts.votePost(post.id, fp(1), 1)).rejects.toMatchObject({ status: 410 });
    await expect(legal.applyLegalHold(post.id, "privacy", "")).rejects.toMatchObject({ status: 409 });

    const [h] = await legal.activeLegalHolds();
    expect(h).toMatchObject({ id: post.id, reason: "defamation", overdue: false });
    expect(new Date(h!.until).getTime() - Date.now()).toBeGreaterThan(29 * 86400_000);
    expect(await legal.moderationLog()).toMatchObject([{ action: "legal_hold", post_id: post.id, reason: "defamation", note: "소명 접수" }]);
  });

  it("restores visibility on release unless the community blind still applies", async () => {
    const a = await newPost();
    await legal.applyLegalHold(a.id, "privacy", "");
    expect(await legal.releaseLegalHold(a.id, "해제")).toEqual({ stillBlinded: false });
    expect((await posts.getPost(a.id))!.is_blinded).toBe(false);
    await expect(legal.releaseLegalHold(a.id, "")).rejects.toMatchObject({ status: 409 });

    const b = await newPost();
    await query("INSERT INTO fingerprints (fingerprint, first_seen) SELECT lpad(g::text, 64, '0'), now() - interval '3 days' FROM generate_series(1, 5) g");
    for (let n = 1; n <= 5; n++) await posts.reportPost(b.id, fp(n), "광고");
    expect((await posts.getPost(b.id))!.is_blinded).toBe(true);
    await legal.applyLegalHold(b.id, "illegal", "");
    expect(await legal.releaseLegalHold(b.id, "")).toEqual({ stillBlinded: true });
    expect((await posts.getPost(b.id))!).toMatchObject({ is_blinded: true, legal_hold: false });
  });

  it("keeps the public log when the post is later deleted and flags overdue holds", async () => {
    const post = await newPost();
    await legal.applyLegalHold(post.id, "copyright", "");
    await query("UPDATE posts SET legal_hold_until = now() - interval '1 day' WHERE id = $1", [post.id]);
    expect((await legal.activeLegalHolds())[0]!.overdue).toBe(true);
    await posts.deletePost(post.id, fp(1), "1234");
    expect(await legal.moderationLog()).toHaveLength(1);
    const [month] = await legal.transparencyStats();
    expect(month).toMatchObject({ legal_holds: 1, legal_releases: 0 });
  });

  it("prunes fingerprints and visitors past the 400-day retention", async () => {
    await query("INSERT INTO fingerprints (fingerprint, first_seen, last_seen) VALUES ($1, now() - interval '500 days', now() - interval '401 days'), ($2, now(), now())", [fp("old"), fp("new")]);
    await query("INSERT INTO visitors (visitor_hash, first_seen, last_seen, last_day) VALUES ($1, now() - interval '500 days', now() - interval '401 days', current_date - 401)", [fp("oldv")]);
    expect((await runMaintenance()).ran).toBe(true);
    expect((await query<{ fingerprint: string }>("SELECT fingerprint FROM fingerprints")).map((r) => r.fingerprint)).toEqual([fp("new")]);
    expect(await query("SELECT 1 FROM visitors")).toHaveLength(0);
  });
});

