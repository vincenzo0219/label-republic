import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

type Hit = { method: string; path: string; params: Record<string, string> };

d("승인 대기함 → 스레드·인스타 자동 게시 (Sprint 52)", async () => {
  process.env.DATABASE_URL = url;
  const hits: Hit[] = [];
  let failNext = false;
  const statusQueue: string[] = [];
  let n = 0;
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const u = new URL(req.url!, "http://x");
      const params = Object.fromEntries(new URLSearchParams(req.method === "GET" ? u.search : raw));
      hits.push({ method: req.method!, path: u.pathname, params });
      res.setHeader("content-type", "application/json");
      if (failNext) {
        failNext = false;
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: { message: `bad request access_token=${params.access_token}` } }));
      }
      if (u.pathname.endsWith("/refresh_access_token")) return res.end(JSON.stringify({ access_token: `refreshed-${params.grant_type}`, expires_in: 5184000 }));
      if (u.searchParams.get("fields") === "permalink") return res.end(JSON.stringify({ permalink: `https://example.test/p/${u.pathname.split("/").pop()}` }));
      if (u.searchParams.get("fields") === "username") return res.end(JSON.stringify({ id: "me", username: "nobangjang" }));
      if (u.searchParams.get("fields") === "status_code") return res.end(JSON.stringify({ status_code: statusQueue.shift() ?? "FINISHED" }));
      return res.end(JSON.stringify({ id: String(++n) }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.THREADS_API_BASE = base;
  process.env.IG_API_BASE = base;
  process.env.THREADS_ACCESS_TOKEN = "env-threads-token";
  process.env.IG_ACCESS_TOKEN = "env-ig-token";

  const { pool, query } = await import("@/lib/db");
  const drafts = await import("@/lib/repo/drafts");
  const social = await import("@/lib/social");
  social.setSocialRetryMs(1);

  beforeAll(async () => {
    await query("DELETE FROM operator_drafts");
    await query("DELETE FROM social_tokens");
  });
  afterAll(async () => {
    await query("DELETE FROM operator_drafts");
    await query("DELETE FROM social_tokens");
    delete process.env.THREADS_ACCESS_TOKEN;
    delete process.env.IG_ACCESS_TOKEN;
    await pool().end();
    server.close();
  });

  it("posts an approved Threads draft with the link as the first reply, once", async () => {
    const t = await drafts.createDraft({ kind: "threads", body: "스레드 본문", extra: "nobangjang.com/posts/1" });
    const done = await drafts.approveDraft(t.id, { body: "고친 스레드 본문" });
    expect(done.status).toBe("posted");
    expect(done.result_url).toMatch(/^https:\/\/example\.test\/p\//);
    const creates = hits.filter((h) => h.path === "/v1.0/me/threads");
    expect(creates.map((h) => h.params.text)).toEqual(["고친 스레드 본문", "nobangjang.com/posts/1"]);
    expect(creates[1]!.params.reply_to_id).toBeTruthy();
    expect(hits.filter((h) => h.path === "/v1.0/me/threads_publish")).toHaveLength(2);
    // 토큰은 POST 본문으로만, 주소에 남기지 않는다
    expect(creates.every((h) => h.method === "POST" && h.params.access_token === "env-threads-token")).toBe(true);
    await expect(drafts.approveDraft(t.id)).rejects.toMatchObject({ status: 409 });
  });

  it("keeps the draft pending with the error (without the token) when Threads refuses, so it can be retried", async () => {
    const t = await drafts.createDraft({ kind: "threads", body: "실패할 글" });
    failNext = true;
    await expect(drafts.approveDraft(t.id)).rejects.toMatchObject({ status: 502 });
    const after = (await drafts.getDraft(t.id))!;
    expect(after.status).toBe("pending");
    expect(after.last_error).toContain("스레드 게시 실패");
    expect(after.last_error).not.toContain("env-threads-token");
    expect((await drafts.approveDraft(t.id)).status).toBe("posted");
  });

  it("posts an Instagram image draft and marks manual uploads without calling Meta", async () => {
    const ig = await drafts.createDraft({ kind: "instagram", body: "인스타 문구", imageUrl: "https://nobangjang.com/marketing/feed1-codec-debate-1080x1350.png" });
    const done = await drafts.approveDraft(ig.id);
    expect(done.status).toBe("posted");
    const media = hits.find((h) => h.path === "/v21.0/me/media")!;
    expect(media.params).toMatchObject({ image_url: "https://nobangjang.com/marketing/feed1-codec-debate-1080x1350.png", caption: "인스타 문구" });
    const before = hits.length;
    const m = await drafts.createDraft({ kind: "threads", body: "직접 올린 글" });
    expect((await drafts.approveDraft(m.id, { manual: true })).status).toBe("copied");
    expect(hits.length).toBe(before);
  });

  it("posts an .mp4 draft as an Instagram Reel and waits for processing", async () => {
    statusQueue.push("IN_PROGRESS", "IN_PROGRESS");
    const r = await drafts.createDraft({ kind: "instagram", body: "릴스 문구", imageUrl: "https://nobangjang.com/marketing/reel-codec.mp4" });
    const done = await drafts.approveDraft(r.id);
    expect(done.status).toBe("posted");
    const media = hits.filter((h) => h.path === "/v21.0/me/media").pop()!;
    expect(media.params).toMatchObject({ media_type: "REELS", caption: "릴스 문구", share_to_feed: "true" });
    expect(media.params.video_url).toBe("https://nobangjang.com/marketing/reel-codec.mp4");
    expect(media.params.image_url).toBeUndefined();
  });

  it("keeps a Reel pending with a clear message when Instagram reports a processing error", async () => {
    statusQueue.push("ERROR");
    const r = await drafts.createDraft({ kind: "instagram", body: "깨진 영상", imageUrl: "https://nobangjang.com/marketing/broken.mp4" });
    await expect(drafts.approveDraft(r.id)).rejects.toMatchObject({ status: 502 });
    const after = (await drafts.getDraft(r.id))!;
    expect(after.status).toBe("pending");
    expect(after.last_error).toContain("영상");
  });

  it("refreshes long-lived tokens weekly and uses the refreshed one; a new .env token wins again", async () => {
    expect(await social.refreshSocialTokens(new Date())).toEqual([]); // 방금 받은 토큰은 갱신하지 않는다
    const later = new Date(Date.now() + 8 * 24 * 3600_000);
    expect((await social.refreshSocialTokens(later)).sort()).toEqual(["instagram", "threads"]);
    await social.postToThreads("갱신 뒤 글");
    expect(hits.at(-2)!.params.access_token).toBe("refreshed-th_refresh_token");
    process.env.THREADS_ACCESS_TOKEN = "new-env-token";
    await social.postToThreads("새 토큰 글");
    expect(hits.filter((h) => h.path === "/v1.0/me/threads").at(-1)!.params.access_token).toBe("new-env-token");
  });

  it("checks a token pasted in the admin screen, then prefers it over the env token (Sprint 53)", async () => {
    failNext = true;
    await expect(social.saveSocialToken("threads", "x".repeat(40))).rejects.toMatchObject({ status: 400 });
    await expect(social.saveSocialToken("threads", "짧음")).rejects.toMatchObject({ status: 400 });
    expect(await social.saveSocialToken("threads", "pasted-token-0123456789abcdef")).toEqual({ account: "nobangjang" });
    await social.postToThreads("붙여넣은 토큰 글");
    expect(hits.filter((h) => h.path === "/v1.0/me/threads").at(-1)!.params.access_token).toBe("pasted-token-0123456789abcdef");
    const status = await social.socialStatus();
    expect(status.threads).toMatchObject({ ready: true, account: "nobangjang" });
    // 환경 변수 없이도 붙여넣은 토큰만으로 연결된다
    delete process.env.IG_ACCESS_TOKEN;
    await query("DELETE FROM social_tokens WHERE platform = 'instagram'");
    expect((await social.socialStatus()).instagram.ready).toBe(false);
    await social.saveSocialToken("instagram", "ig-pasted-token-0123456789");
    expect((await social.socialStatus()).instagram.ready).toBe(true);
    expect(await drafts.socialAuto("instagram")).toBe(true);
  });
});
