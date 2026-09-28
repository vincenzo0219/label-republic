import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Script } from "node:vm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { contentHash, requestKeyFor } from "@/lib/client-api";
import { killSwitchSource, serviceWorkerSource } from "@/lib/sw-source";

describe("service worker source", () => {
  it("compiles and is versioned per build", () => {
    const a = serviceWorkerSource("build-a");
    expect(() => new Script(a)).not.toThrow();
    expect(a).toContain("build-a");
    expect(serviceWorkerSource("build-b")).not.toBe(a);
  });

  it("never caches API, admin or the worker itself, and honours the no-store meta", () => {
    const src = serviceWorkerSource("x");
    for (const s of ["/api/", "/admin", "/sw.js", "lr-offline", "no-store"]) expect(src).toContain(s);
  });

  it("kill switch compiles, clears only this site's caches and never force-reloads pages", () => {
    const src = killSwitchSource();
    expect(() => new Script(src)).not.toThrow();
    expect(src).toContain('startsWith("lr-")');
    expect(src).toContain("unregister()");
    expect(src).not.toContain("navigate(");
    expect(src).not.toContain('"fetch"');
  });
});

describe("request keys (client)", () => {
  it("reuses the key for the same content and makes a new one when it changes", () => {
    const slot: { current: { key: string; sent: string } | undefined } = { current: undefined };
    const k1 = requestKeyFor(slot, { body: "안녕", pw: "1234" });
    expect(requestKeyFor(slot, { body: "안녕", pw: "1234" })).toBe(k1);
    expect(requestKeyFor(slot, { body: "안녕하세요", pw: "1234" })).not.toBe(k1);
    expect(k1).toMatch(/^[A-Za-z0-9-]{16,64}$/);
    // 슬롯(글쓰기 임시저장에도 저장됨)에는 비밀번호가 그대로 남지 않는다
    expect(JSON.stringify(slot.current)).not.toContain("1234");
    expect(contentHash("a")).not.toBe(contentHash("b"));
  });
});

// after() 는 Next 요청 안에서만 동작한다 — 테스트에서는 바로 실행
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => void Promise.resolve().then(fn).catch(() => {}) }));

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("idempotent writes (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const posts = await import("@/lib/repo/posts");
  const comments = await import("../src/app/api/posts/[id]/comments/route");
  const create = await import("../src/app/api/posts/route");
  const { runMaintenance } = await import("@/lib/jobs/maintenance");

  const req = (p: string, body: unknown, headers: Record<string, string> = {}) =>
    new Request(`http://localhost${p}`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "phone-wifi", ...headers },
      body: JSON.stringify(body),
    });
  const ctx = <P>(params: P) => ({ params: Promise.resolve(params) });
  let postId = "";

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  beforeEach(async () => {
    await resetRateLimits();
    await query("TRUNCATE posts, fingerprints, idempotency_keys RESTART IDENTITY CASCADE");
    const post = await posts.createPost({
      categorySlug: "supplements", nickname: "작성자", pin: "1234", title: "마그네슘 정리",
      body: "마그네슘 350mg 입니다.", summary: { lines: ["하나", "둘", "셋"], model: "author", isAuthorEdited: true }, fingerprint: "a".repeat(64),
    });
    postId = String(post.id);
  });
  afterAll(async () => {
    await pool().end();
  });

  const comment = { nickname: "댓글러", pw: "1234", body: "좋은 정보 감사합니다" };
  const KEY = "0f8e2b7a-5c1d-4e3f-9a6b-1c2d3e4f5a6b";

  it("replays the first result for a retried comment, even from a new network", async () => {
    const first = await comments.POST(req(`/api/posts/${postId}/comments`, comment, { "idempotency-key": KEY }), ctx({ id: postId }));
    expect(first.status).toBe(201);
    // 와이파이 → LTE 로 바뀌어 IP·지문이 달라진 재전송
    const again = await comments.POST(
      req(`/api/posts/${postId}/comments`, comment, { "idempotency-key": KEY, "user-agent": "phone-lte" }),
      ctx({ id: postId }),
    );
    expect(again.status).toBe(201);
    expect(again.headers.get("idempotent-replay")).toBe("true");
    expect((await again.json()).comment.id).toBe((await first.json()).comment.id);
    expect(await query("SELECT count(*)::int AS n FROM comments")).toEqual([{ n: 1 }]);
    // 키 없이 보내면 평소처럼 새로 달린다
    expect((await comments.POST(req(`/api/posts/${postId}/comments`, comment), ctx({ id: postId }))).status).toBe(201);
    expect(await query("SELECT count(*)::int AS n FROM comments")).toEqual([{ n: 2 }]);
  });

  it("rejects the same key with different content, and while the first request is still running", async () => {
    await comments.POST(req(`/api/posts/${postId}/comments`, comment, { "idempotency-key": KEY }), ctx({ id: postId }));
    const changed = await comments.POST(req(`/api/posts/${postId}/comments`, { ...comment, body: "다른 내용" }, { "idempotency-key": KEY }), ctx({ id: postId }));
    expect(changed.status).toBe(409);
    expect((await changed.json()).error.code).toBe("idempotency_conflict");

    const busy = "busy-1234567890abcdef";
    const { createHash } = await import("node:crypto");
    await query("INSERT INTO idempotency_keys (key, scope, body_hash) VALUES ($1, 'comment', $2)", [
      busy, createHash("sha256").update(JSON.stringify(comment)).digest("hex"),
    ]);
    const running = await comments.POST(req(`/api/posts/${postId}/comments`, comment, { "idempotency-key": busy }), ctx({ id: postId }));
    expect(running.status).toBe(409);
    expect((await running.json()).error.code).toBe("in_progress");
    // 처리 중에 서버가 죽어 2분 넘게 남은 키는 이어받아 처리한다
    await query("UPDATE idempotency_keys SET created_at = now() - interval '3 minutes' WHERE key = $1", [busy]);
    const retaken = await comments.POST(req(`/api/posts/${postId}/comments`, comment, { "idempotency-key": busy }), ctx({ id: postId }));
    expect(retaken.status).toBe(201);
    expect((await comments.POST(req(`/api/posts/${postId}/comments`, comment, { "idempotency-key": busy }), ctx({ id: postId }))).headers.get("idempotent-replay")).toBe("true");
    // 키 형식 검사
    expect((await comments.POST(req(`/api/posts/${postId}/comments`, comment, { "idempotency-key": "short" }), ctx({ id: postId }))).status).toBe(400);
  });

  it("does not remember failures, so the corrected request can reuse the key", async () => {
    const bad = await comments.POST(req(`/api/posts/${postId}/comments`, { ...comment, body: "" }, { "idempotency-key": KEY }), ctx({ id: postId }));
    expect(bad.status).toBe(400);
    expect(await query("SELECT count(*)::int AS n FROM idempotency_keys")).toEqual([{ n: 0 }]);
    const missing = await comments.POST(req(`/api/posts/999999/comments`, comment, { "idempotency-key": KEY }), ctx({ id: "999999" }));
    expect(missing.status).toBe(404);
    expect(await query("SELECT count(*)::int AS n FROM idempotency_keys")).toEqual([{ n: 0 }]);
  });

  it("creates a post only once when the author retries after a dropped connection", async () => {
    const body = {
      category: "supplements", postType: "info", nickname: "작성자", pw: "1234", title: "아연 정리",
      body: "아연 15mg 이 들어 있습니다.", summary: ["첫째 요약입니다", "둘째 요약입니다", "셋째 요약입니다"],
    };
    const a = await create.POST(req("/api/posts", body, { "idempotency-key": KEY }), ctx({}));
    const b = await create.POST(req("/api/posts", body, { "idempotency-key": KEY }), ctx({}));
    expect([a.status, b.status]).toEqual([201, 201]);
    expect((await b.json()).post.id).toBe((await a.json()).post.id);
    expect(await query("SELECT count(*)::int AS n FROM posts WHERE title = '아연 정리'")).toEqual([{ n: 1 }]);
    // 같은 키라도 댓글에 쓰면 다른 종류의 요청 → 거절
    expect((await comments.POST(req(`/api/posts/${postId}/comments`, body, { "idempotency-key": KEY }), ctx({ id: postId }))).status).toBe(409);
  });

  it("maintenance forgets stored results after 24 hours", async () => {
    await comments.POST(req(`/api/posts/${postId}/comments`, comment, { "idempotency-key": KEY }), ctx({ id: postId }));
    await runMaintenance(new Date(Date.now() + 25 * 3600_000));
    expect(await query("SELECT count(*)::int AS n FROM idempotency_keys")).toEqual([{ n: 0 }]);
  });
});
