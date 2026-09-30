import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { diffLines } from "@/lib/diff";
import { fingerprintOf, safePath } from "@/lib/error-tracking";

describe("error grouping", () => {
  it("groups the same error regardless of ids and quoted values, per code location", () => {
    const stack = "Error: x\n    at loadPost (/app/src/lib/repo/posts.ts:240:11)\n    at node:internal/process:1:1";
    const a = fingerprintOf("api", 'duplicate key value violates unique constraint "x" (id)=(123)', stack);
    const b = fingerprintOf("api", 'duplicate key value violates unique constraint "y" (id)=(456)', stack.replace(":240:11", ":241:3"));
    expect(a).toBe(b);
    expect(fingerprintOf("page", "boom", stack)).not.toBe(fingerprintOf("api", "boom", stack));
    expect(fingerprintOf("api", "boom", stack)).not.toBe(fingerprintOf("api", "boom", stack.replace("posts.ts", "votes.ts")));
  });

  it("keeps only the path (no query strings with search terms or tokens)", () => {
    expect(safePath("/search?q=비밀&token=abc")).toBe("/search");
    expect(safePath("GET /api/posts/1?pw=1234")).toBe("/GET%20/api/posts/1");
    expect(safePath(undefined)).toBe("");
  });

  it("caps diff work with a budget", () => {
    const a = Array.from({ length: 300 }, (_, i) => `a${i}`).join("\n");
    const b = Array.from({ length: 300 }, (_, i) => `b${i}`).join("\n");
    expect(diffLines(a, b)).not.toBeNull();
    expect(diffLines(a, b, 10_000)).toBeNull();
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("launch hardening (database)", async () => {
  process.env.DATABASE_URL = url;
  // 알림 웹훅을 받을 로컬 서버
  const hooks: string[] = [];
  const hookServer: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      hooks.push(JSON.parse(body).text);
      res.end("ok");
    });
  });
  await new Promise<void>((r) => hookServer.listen(0, "127.0.0.1", r));
  process.env.ALERT_WEBHOOK_URL = `http://127.0.0.1:${(hookServer.address() as AddressInfo).port}/hook`;
  process.env.VAPID_PUBLIC_KEY ??= "BJyhChVe5EGK43t4YIx_JY7qKTHYaNDxPb4rRc127qjG_gZTx3mLunQSNYEijYzLj9765SwakO0nztpkSLhHCpE";
  process.env.VAPID_PRIVATE_KEY ??= "4Q70eyK6QzLFBI4LXp1IifK05o6fu2DpT3i4GACfl4Y";

  const { pool, query } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const et = await import("@/lib/error-tracking");
  const { route } = await import("@/lib/http");
  const posts = await import("@/lib/repo/posts");
  const corrections = await import("@/lib/repo/corrections");
  const push = await import("@/lib/repo/push");
  const { watchUpdates } = await import("@/lib/repo/watch");
  const { moderationLog } = await import("@/lib/repo/legal");
  const bk = await import("../scripts/backup");

  const AUTHOR = "a".repeat(64);
  const newPost = (title = "마그네슘 함량 정리") =>
    posts.createPost({
      categorySlug: "supplements", nickname: "작성자", pin: "1234", title,
      body: "이 제품은 1정에 마그네슘 350mg이 들어 있습니다.\n문의는 카톡 아이디 mag350 로 주세요.",
      summary: { lines: ["하나", "둘", "셋"], model: "author", isAuthorEdited: true },
      fingerprint: AUTHOR,
      products: [{ brand: "NOW", name: "Mag" }],
      facts: [{ product: 0, attribute: "마그네슘", value: 350, unit: "mg", basis: "1정", kind: "label" }],
    });

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      await query(readFileSync(path.join(dir, f), "utf8"));
    }
    await query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql"))) await query("INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING", [f]);
  });
  beforeEach(async () => {
    await resetRateLimits();
    et.resetErrorTrackingForTests();
    hooks.length = 0;
    await query("TRUNCATE posts, products, fingerprints, error_events, push_subscriptions, moderation_log RESTART IDENTITY CASCADE");
  });
  afterAll(async () => {
    hookServer.close();
    await pool().end();
  });

  it("records API errors grouped, alerts on new / reopened / spiking errors", async () => {
    const handler = route(async () => {
      throw new Error("relation \"missing_42\" does not exist");
    });
    const res = await handler(new Request("http://x/api/boom?q=secret"), { params: Promise.resolve({}) });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: "internal", message: "서버 오류가 발생했습니다." } });
    await handler(new Request("http://x/api/boom"), { params: Promise.resolve({}) });
    await et.flushErrors();
    let rows = await query<{ kind: string; count: number; path: string; message: string }>("SELECT kind, count, path, message FROM error_events");
    expect(rows).toEqual([{ kind: "api", count: 2, path: "/GET%20/api/boom", message: 'relation "missing_42" does not exist' }]);
    expect(hooks).toHaveLength(1);
    expect(hooks[0]).toMatch(/새 오류 \[api\]/);

    // 같은 오류가 또 나면 알림 없이 횟수만
    const boom = () => handler(new Request("http://x/api/boom"), { params: Promise.resolve({}) });
    await boom();
    await et.flushErrors();
    expect(hooks).toHaveLength(1);

    // 해결 표시 후 재발하면 다시 알림
    await query("UPDATE error_events SET resolved_at = now()");
    await boom();
    await et.flushErrors();
    expect(hooks.at(-1)).toMatch(/재발/);
    rows = await query("SELECT resolved_at FROM error_events");
    expect(rows[0]).toEqual({ resolved_at: null });

    // 한 시간에 50번 넘게 나면 급증 알림 (알린 지 한 시간 안이면 다시 안 보냄)
    await query("UPDATE error_events SET alerted_at = now() - interval '2 hours'");
    for (let i = 0; i < 60; i++) await boom();
    await et.flushErrors();
    expect(hooks.at(-1)).toMatch(/급증/);
    const n = hooks.length;
    for (let i = 0; i < 60; i++) await boom();
    await et.flushErrors();
    expect(hooks.length).toBe(n);
  });

  it("security fixes: blinded titles, push takeover, correction reports by the author, response race", async () => {
    const post = await newPost();
    // 블라인드 글은 제목도 가린다 (API·관심 글 소식)
    await query("UPDATE posts SET is_blinded = true WHERE id = $1", [post.id]);
    expect((await posts.getPost(post.id))!.title).toBe("");
    expect((await watchUpdates([], [post.id], new Date(0), null)).posts[0]!.title).toBe("");
    await query("UPDATE posts SET is_blinded = false WHERE id = $1", [post.id]);

    // 같은 푸시 주소를 다른 키로 등록하려면 토큰이 필요
    const endpoint = "https://fcm.googleapis.com/fcm/send/takeover-test";
    const keys = { p256dh: "BOriginalKeyOriginalKeyOriginalKey", auth: "orig-auth-secret" };
    const { token } = await push.subscribe({ endpoint, ...keys }, { products: [], posts: [] }, AUTHOR);
    expect(await push.subscribe({ endpoint, ...keys }, { products: [], posts: [post.id] }, AUTHOR)).toEqual({ token });
    await expect(push.subscribe({ endpoint, p256dh: "BAttackerKeyAttackerKeyAttacker", auth: "evil-auth-secret" }, { products: [], posts: [] }, "e".repeat(64))).rejects.toMatchObject({ status: 409 });
    expect((await query<{ p256dh: string }>("SELECT p256dh FROM push_subscriptions"))[0]!.p256dh).toBe(keys.p256dh);
    await push.subscribe({ endpoint, p256dh: "BRotatedKeyRotatedKeyRotatedKey", auth: "new-auth-secret" }, { products: [], posts: [] }, AUTHOR, token);

    // 글 작성자는 자기 글의 정정 제안을 신고할 수 없고, 갓 생긴 이용자 신고는 절반만 센다
    const c = await corrections.createCorrection(post.id, {
      nickname: "정정러", pin: "5678", target: "other", quote: "제목", proposal: "제목 수정", reason: "제목이 내용과 다릅니다. 확인해 주세요.", fingerprint: "b".repeat(64),
    });
    await expect(corrections.reportCorrection(c.id, AUTHOR)).rejects.toMatchObject({ status: 403 });
    for (const v of ["1", "2", "3", "4", "5"]) await corrections.reportCorrection(c.id, v.repeat(64));
    expect((await query<{ is_hidden: boolean; report_count: number }>("SELECT is_hidden, report_count FROM corrections"))[0]).toEqual({ is_hidden: false, report_count: 5 });
    for (const v of ["6", "7", "8", "9"]) {
      await query("SELECT touch_fingerprint($1, now() - interval '30 days')", [v.repeat(64)]);
      await corrections.reportCorrection(c.id, v.repeat(64));
    }
    // 5 × 0.5 + 4 × 1 = 6.5 ≥ 5 이고 고유 신고 9건 → 가려짐
    expect((await query<{ is_hidden: boolean }>("SELECT is_hidden FROM corrections"))[0]!.is_hidden).toBe(true);

    // 철회된 제안에 늦게 도착한 작성자 응답은 거절
    const c2 = await corrections.createCorrection(post.id, {
      nickname: "정정러2", pin: "5678", target: "other", quote: "제목", proposal: "제목 수정", reason: "제목이 내용과 다릅니다. 확인해 주세요.", fingerprint: "c".repeat(64),
    });
    await corrections.withdrawCorrection(c2.id, "c".repeat(64), "5678");
    await expect(corrections.respondCorrection(c2.id, AUTHOR, "1234", "answered", "답변")).rejects.toMatchObject({ status: 409 });
    await expect(corrections.withdrawCorrection(c2.id, "c".repeat(64), "5678")).rejects.toMatchObject({ status: 409 });
  });

  it("revision redaction by author (PIN) and by legal request (public log)", async () => {
    const post = await newPost();
    await posts.updatePost(post.id, AUTHOR, "1234", { body: "이 제품은 1정에 마그네슘 350mg이 들어 있습니다.\n문의는 댓글로 주세요." });
    await posts.updatePost(post.id, AUTHOR, "1234", { title: "마그네슘 함량 정리 (수정)" });
    let revs = await posts.listRevisions(post.id);
    expect(revs.map((r) => r.body.includes("mag350"))).toEqual([false, true]);
    await expect(posts.redactRevision(post.id, revs[1]!.id, { kind: "author", fp: AUTHOR, pin: "0000" })).rejects.toMatchObject({ status: 403 });
    await posts.redactRevision(post.id, revs[1]!.id, { kind: "author", fp: AUTHOR, pin: "1234" });
    await posts.redactRevision(post.id, revs[0]!.id, { kind: "legal", reason: "privacy", note: "" });
    revs = await posts.listRevisions(post.id);
    expect(revs.map((r) => [r.title, r.body, r.redacted_by])).toEqual([["", "", "legal"], ["", "", "author"]]);
    await expect(posts.redactRevision(post.id, revs[0]!.id, { kind: "legal", reason: "privacy", note: "" })).rejects.toMatchObject({ status: 404 });
    expect((await moderationLog(5))[0]).toMatchObject({ action: "revision_redacted", subject_type: "post", subject_id: post.id, reason: "privacy" });
    // 다른 글의 이력 번호로는 지울 수 없다
    const other = await newPost("다른 글");
    await expect(posts.redactRevision(other.id, revs[0]!.id, { kind: "legal", reason: "privacy", note: "" })).rejects.toMatchObject({ status: 404 });
  });

  it("backup → verify (scratch restore, checksums, row counts) → restore into an empty DB", async () => {
    await newPost();
    await newPost("두 번째 글");
    const dir = mkdtempSync(path.join(tmpdir(), "lr-backup-"));
    const uploads = mkdtempSync(path.join(tmpdir(), "lr-uploads-"));
    writeFileSync(path.join(uploads, "a.webp"), "fake-image");
    const m = await bk.backup({ url: url!, dir, uploadDir: uploads, keep: 2 });
    expect(m.rows).toMatchObject({ posts: 2, products: 1, product_facts: 2 });
    expect(m.latest_migration).toMatch(/^0\d\d_/);
    const dump = path.join(dir, m.dump);
    expect(await bk.verify(dump, url!)).toEqual({ ok: true, problems: [] });

    // 손상된 덤프는 체크섬으로 걸린다
    const tampered = path.join(dir, "tampered.dump");
    writeFileSync(tampered, Buffer.concat([readFileSync(dump), Buffer.from("x")]));
    writeFileSync(tampered.replace(/\.dump$/, ".json"), readFileSync(dump.replace(/\.dump$/, ".json")));
    const bad = await bk.verify(tampered, url!).catch((e: Error) => ({ ok: false, problems: [e.message] }));
    expect(bad.ok).toBe(false);

    // 빈 DB 에 복원 (+ 첨부 사진)
    const target = new URL(url!);
    target.pathname = "/labelrep_restore_target_test";
    const { Client } = await import("pg");
    const admin = new Client({ connectionString: url!.replace(/\/[^/]+$/, "/postgres") });
    await admin.connect();
    await admin.query("DROP DATABASE IF EXISTS labelrep_restore_target_test WITH (FORCE)");
    await admin.query("CREATE DATABASE labelrep_restore_target_test");
    const restoredUploads = mkdtempSync(path.join(tmpdir(), "lr-restored-"));
    const s = await bk.restore(dump, target.toString(), { uploads: restoredUploads });
    expect(s.rows).toEqual(m.rows);
    expect(readFileSync(path.join(restoredUploads, "a.webp"), "utf8")).toBe("fake-image");
    // 이미 데이터가 있는 DB 에는 --force 없이 복원하지 않는다
    await expect(bk.restore(dump, target.toString())).rejects.toThrow(/--force/);
    expect((await bk.restore(dump, target.toString(), { force: true })).rows).toEqual(m.rows);
    await admin.query("DROP DATABASE IF EXISTS labelrep_restore_target_test WITH (FORCE)");
    await admin.end();

    // 보관 개수: keep=2
    await bk.backup({ url: url!, dir, keep: 2 });
    await new Promise((r) => setTimeout(r, 1100));
    await bk.backup({ url: url!, dir, keep: 2 });
    expect(readdirSync(dir).filter((f) => /^labelrep-\d{8}-\d{6}\.json$/.test(f))).toHaveLength(2);
  }, 60_000);
});
