import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, readdir, utimes, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const dir = mkdtempSync(path.join(tmpdir(), "lr-snap-"));
process.env.SNAPSHOT_DIR = dir;

const snaps = await import("@/lib/snapshots");
const shttp = await import("@/lib/snapshot-http");
const db = await import("@/lib/db");

describe("snapshot keys", () => {
  it.each([
    ["/", "/"],
    ["/posts/12", "/posts/12"],
    ["/p/7?utm_source=x", "/p/7"],
    ["/c/supplements?sort=latest&page=2&x=1", "/c/supplements?page=2&sort=latest"],
    ["/c/%EC%98%81%EC%96%91", "/c/영양"],
    ["/c/supplements/facts?attr=마그네슘", "/c/supplements/facts?attr=%EB%A7%88%EA%B7%B8%EB%84%A4%EC%8A%98"],
    ["/rules", "/rules"],
  ])("%s → %s", (url, key) => {
    expect(snaps.snapshotKey(url)).toBe(key);
  });

  it("keeps only known condition values, so random query strings cannot multiply files (Sprint 29)", () => {
    expect(snaps.snapshotKey("/c/supplements?sort=" + "x".repeat(50) + "&page=abc")).toBe("/c/supplements");
    expect(snaps.snapshotKey("/c/supplements?page=501&sort=votes")).toBe("/c/supplements?sort=votes");
    expect(snaps.snapshotKey("/renewals?status=confirmed")).toBe("/renewals");
    expect(snaps.snapshotKey("/c/supplements/facts?attr=" + "가".repeat(41))).toBe("/c/supplements/facts");
  });

  it.each(["/admin", "/admin/moderation", "/write", "/search?q=a", "/me", "/posts/1/edit", "/api/health", "/c/a/b/c", "/%E0%A4%A"])("does not store %s", (url) => {
    expect(snaps.snapshotKey(url)).toBeNull();
  });

  it("falls back to the key without conditions", () => {
    expect(snaps.baseKey("/c/supplements?sort=latest")).toBe("/c/supplements");
  });
});

describe("snapshot store", () => {
  beforeEach(async () => {
    for (const d of await readdir(dir)) await import("node:fs/promises").then((fs) => fs.rm(path.join(dir, d), { recursive: true, force: true }));
  });

  it("saves, loads (with fallback) and marks pages read-only without touching the DOM tree", async () => {
    await snaps.saveSnapshot("/c/supplements", '<!DOCTYPE html><html><head></head><body class="x"><main>보드</main></body></html>');
    const exact = await snaps.loadSnapshot("/c/supplements");
    expect(exact).toMatchObject({ key: "/c/supplements" });
    const fallback = await snaps.loadSnapshot("/c/supplements?sort=latest");
    expect(fallback).toMatchObject({ key: "/c/supplements" });
    expect(await snaps.loadSnapshot("/posts/1")).toBeNull();

    const html = snaps.withReadOnlyNotice(exact!.html, Date.UTC(2026, 8, 28, 4, 5));
    expect(html).toContain('<body data-lr-readonly="⚠️ 지금은 서버 점검 중이라 읽기만 할 수 있어요 · 9월 28일 13:05 기준 화면');
    expect(html).toContain('class="x"><main>보드</main>');
    expect(await snaps.snapshotStats()).toMatchObject({ count: 1 });
  });

  it("prunes other builds and old pages", async () => {
    await snaps.saveSnapshot("/", "<html><body>홈</body></html>");
    await snaps.saveSnapshot("/rules", "<html><body>규칙</body></html>");
    await mkdir(path.join(dir, "old-build"), { recursive: true });
    await writeFile(path.join(dir, "old-build", "a.html"), "x");
    const cur = path.join(dir, snaps.buildId());
    const old = (await readdir(cur))[0]!;
    const t = new Date(Date.now() - 8 * 24 * 3600_000);
    await utimes(path.join(cur, old), t, t);
    expect(await snaps.pruneSnapshots(7 * 24 * 3600_000)).toEqual({ removed: 2 });
    expect(await readdir(dir)).toEqual([snaps.buildId()]);
    expect(await snaps.snapshotStats()).toMatchObject({ count: 1 });
  });

  it("remembers which page each file is, deletes on request, and removes pages that are gone (Sprint 29)", async () => {
    await snaps.saveSnapshot("/posts/7", "<html><body>글</body></html>");
    await snaps.saveSnapshot("/c/영양", "<html><body>보드</body></html>");
    expect((await snaps.listSnapshotKeys()).sort()).toEqual(["/c/영양", "/posts/7"]);
    await snaps.deleteSnapshot("/posts/7");
    expect(await snaps.listSnapshotKeys()).toEqual(["/c/영양"]);
  });

  it("only trusts the signed crawler header", () => {
    expect(snaps.isSnapshotRequest(snaps.snapshotToken())).toBe(true);
    expect(snaps.isSnapshotRequest("0".repeat(40))).toBe(false);
    expect(snaps.isSnapshotRequest(undefined)).toBe(false);
    expect(snaps.isSnapshotRequest(["a", "b"])).toBe(false);
  });
});

describe("connection errors", () => {
  it.each([
    [{ code: "ECONNREFUSED" }, true],
    [{ code: "57P01", message: "terminating connection due to administrator command" }, true],
    [{ code: "57P03" }, true],
    [{ code: "08006" }, true],
    [new Error("Connection terminated unexpectedly"), true],
    [new Error("timeout exceeded when trying to connect"), true],
    [{ code: "23505" }, false],
    [{ code: "57014" }, false],
    [{ code: "42601", message: "syntax error" }, false],
    // 쿼리 인자 수가 맞지 않는 코드 버그(protocol_violation)는 DB 장애가 아니다 — 한 화면의 버그로 사이트 전체가 읽기 전용이 되지 않게 (Sprint 36)
    [{ code: "08P01", message: "bind message supplies 1 parameters, but prepared statement \"\" requires 0" }, false],
    [null, false],
    // 이용자 입력이 섞인 Postgres 오류 메시지로 읽기 전용 모드를 켜지 못하게 (Sprint 29)
    [{ code: "22P02", message: 'invalid input syntax for type bigint: "Connection terminated"' }, false],
  ])("%j → %s", (err, want) => {
    expect(db.isConnectionError(err)).toBe(want);
  });
});

/** 테스트용 서버: server.ts 와 같은 순서로 저장본 만들기·5xx 대체를 붙인다 */
function testServer(render: (req: IncomingMessage, res: ServerResponse) => void, down: () => boolean) {
  return createServer((req, res) => {
    const key = snaps.snapshotKey(req.url ?? "/");
    if (key && snaps.isSnapshotRequest(req.headers[snaps.SNAPSHOT_HEADER])) shttp.captureSnapshot(res, key);
    else if (key) shttp.onServerError(res, down, () => shttp.sendSnapshot(req, res, key));
    render(req, res);
  });
}
async function listen(s: Server): Promise<string> {
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
}

describe("capture and fallback over HTTP", () => {
  let down = false;
  let mode: "ok" | "fail" | "gzip" | "404" = "ok";
  const server = testServer((req, res) => {
    if (mode === "fail") {
      // Next 가 DB 오류로 그린 오류 화면 — 헤더를 먼저 정하고 나눠 쓴다
      res.statusCode = 500;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.write("<html><body>오류");
      res.end("</body></html>");
      return;
    }
    if (mode === "404") {
      res.writeHead(404, { "content-type": "text/html" });
      return res.end("<html><body>없음</body></html>");
    }
    if (mode === "gzip") {
      res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
      return res.end(gzipSync("<html><body>압축</body></html>"));
    }
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.write(`<html><body><h1>${req.url}</h1>`);
    res.end("</body></html>");
  }, () => down);
  let base = "";
  const crawl = (url: string) => fetch(base + url, { headers: { [snaps.SNAPSHOT_HEADER]: snaps.snapshotToken(), "accept-encoding": "identity" } });

  beforeAll(async () => {
    base = await listen(server);
  });
  afterAll(() => server.close());

  it("stores only signed 200 uncompressed HTML", async () => {
    mode = "ok";
    await (await fetch(`${base}/posts/1`)).text(); // 이용자 요청 → 저장 안 함
    expect(await snaps.snapshotSavedAt("/posts/1")).toBeNull();
    expect(await (await crawl("/posts/1")).text()).toBe("<html><body><h1>/posts/1</h1></body></html>");
    await new Promise((r) => setTimeout(r, 50));
    expect((await snaps.loadSnapshot("/posts/1"))!.html).toBe("<html><body><h1>/posts/1</h1></body></html>");
    mode = "404";
    await (await crawl("/posts/2")).text();
    mode = "gzip";
    await (await crawl("/posts/3")).arrayBuffer();
    await new Promise((r) => setTimeout(r, 50));
    expect(await snaps.snapshotSavedAt("/posts/2")).toBeNull();
    expect(await snaps.snapshotSavedAt("/posts/3")).toBeNull();
  });

  it("keeps wrappers added after it (Next compression) when passing a normal page through", async () => {
    // 브라우저 요청에 Next 가 압축을 감싸는 것처럼: onServerError 뒤에 res.write/end 를 다시 감싼다
    const s2 = createServer((req, res) => {
      shttp.onServerError(res, () => true, () => shttp.sendSnapshot(req, res, "/posts/1"));
      const write = res.write.bind(res) as (c: unknown) => boolean;
      const end = res.end.bind(res) as (c?: unknown) => ServerResponse;
      res.write = ((c: unknown) => write(String(c).toUpperCase())) as ServerResponse["write"];
      res.end = ((c?: unknown) => end(c === undefined ? c : String(c).toUpperCase())) as ServerResponse["end"];
      res.setHeader("content-type", "text/html");
      res.write("<html><body>첫 조각 ");
      res.write("two ");
      res.end("three</body></html>");
    });
    const b2 = await listen(s2);
    try {
      expect(await (await fetch(b2 + "/posts/5")).text()).toBe("<HTML><BODY>첫 조각 TWO THREE</BODY></HTML>");
    } finally {
      s2.close();
    }
  });

  it("deletes the stored page when the crawler finds it gone (404)", async () => {
    mode = "ok";
    await (await crawl("/posts/44")).text();
    await new Promise((r) => setTimeout(r, 50));
    expect(await snaps.snapshotSavedAt("/posts/44")).not.toBeNull();
    mode = "404";
    await (await crawl("/posts/44")).text();
    await new Promise((r) => setTimeout(r, 50));
    expect(await snaps.snapshotSavedAt("/posts/44")).toBeNull();
  });

  it("replaces a 5xx render with the snapshot only while the DB is down", async () => {
    mode = "fail";
    down = false;
    const bug = await fetch(`${base}/posts/1`);
    expect(bug.status).toBe(500); // 코드 버그는 그대로
    expect(await bug.text()).toContain("오류");

    down = true;
    const r = await fetch(`${base}/posts/1`);
    expect(r.status).toBe(200);
    expect(r.headers.get("x-lr-read-only")).toBe("1");
    expect(r.headers.get("x-frame-options")).toBe("DENY");
    const html = await r.text();
    expect(html).toContain("<h1>/posts/1</h1>");
    expect(html).toContain("data-lr-readonly=");

    // 저장본이 없으면 점검 안내 503
    const none = await fetch(`${base}/posts/9`);
    expect(none.status).toBe(503);
    expect(none.headers.get("retry-after")).toBe("30");
    expect(await none.text()).toContain("잠시 점검 중이에요");
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("read-only mode with a database", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { route } = await import("@/lib/http");
  const posts = await import("@/lib/repo/posts");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const jobs = await import("@/lib/jobs/snapshots");

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const mdir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(mdir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(mdir, f), "utf8"));
    await resetRateLimits();
  });
  afterAll(async () => {
    await pool().end();
  });

  it("marks the DB down on connection errors and recovers by itself", async () => {
    db.markDbDown(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));
    expect(db.dbDown()).toBe(true);
    expect(db.dbDownSince()).not.toBeNull();
    // 2초마다 확인 쿼리 → DB 는 살아 있으므로 곧 풀린다
    for (let i = 0; i < 30 && db.dbDown(); i++) await new Promise((r) => setTimeout(r, 200));
    expect(db.dbDown()).toBe(false);
  });

  it("API routes answer 503 db_unavailable instead of a server error", async () => {
    const h = route(async () => {
      throw Object.assign(new Error("Connection terminated unexpectedly"), {});
    });
    // DB 가 멀쩡한데 다른 곳(이미지 저장소 등)의 연결 오류 → 그대로 서버 오류 (Sprint 29)
    expect((await h(new Request("http://x/api/posts", { method: "POST" }), { params: Promise.resolve({}) })).status).toBe(500);
    await query("DELETE FROM error_events");
    db.markDbDown(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));
    const res = await h(new Request("http://x/api/posts", { method: "POST" }), { params: Promise.resolve({}) });
    db.markDbUp();
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("30");
    expect(await res.json()).toMatchObject({ error: { code: "db_unavailable" } });
    expect(await query("SELECT count(*)::int AS n FROM error_events")).toEqual([{ n: 0 }]);
  });

  it("crawls public pages as an anonymous visitor and skips fresh ones", async () => {
    for (let i = 0; i < 3; i++) {
      await posts.createPost({
        categorySlug: "supplements", nickname: "작성자", pin: "1234", title: `마그네슘 성분표 ${i}`, body: "1정에 마그네슘 200mg 입니다.",
        summary: { lines: ["하나", "둘", "셋"], model: "author", isAuthorEdited: true },
        products: [{ brand: "NOW", name: `Magnesium ${i}` }],
      });
    }
    const targets = await jobs.snapshotTargets(4, 2);
    expect(targets).toEqual(expect.arrayContaining(["/", "/rules", "/c/supplements", "/c/supplements/products"]));
    // 추천 많은 글 절반 + 최근 글 절반 (겹치면 한 번), 글 많은 제품
    expect(targets.filter((t) => t.startsWith("/posts/")).sort()).toEqual(["/posts/2", "/posts/3"]);
    expect(targets.filter((t) => t.startsWith("/p/")).sort()).toEqual(["/p/2", "/p/3"]);
    expect(targets.every((t) => snaps.snapshotKey(t) !== null)).toBe(true);

    const seen: string[] = [];
    const server = testServer((req, res) => {
      seen.push(`${req.url} ${req.headers["user-agent"]}`);
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(`<html><body>${req.url}</body></html>`);
    }, () => false);
    const port = Number(new URL(await listen(server)).port);
    try {
      const first = await jobs.refreshSnapshots({ port, freshMs: 60_000 });
      expect(first).toMatchObject({ ran: true, failed: 0 });
      expect(first.fetched + first.skipped).toBe((await jobs.snapshotTargets()).length);
      expect(first.fetched).toBeGreaterThan(10);
      await new Promise((r) => setTimeout(r, 100));
      expect((await snaps.loadSnapshot("/posts/3"))!.html).toBe("<html><body>/posts/3</body></html>");
      expect(seen.every((s) => s.endsWith(snaps.SNAPSHOT_UA))).toBe(true);
      const again = await jobs.refreshSnapshots({ port, freshMs: 60_000 });
      expect(again.fetched).toBe(0);
      // DB 가 멈춘 동안에는 받지 않는다
      db.markDbDown(Object.assign(new Error("x"), { code: "ECONNREFUSED" }));
      expect(await jobs.refreshSnapshots({ port, freshMs: 0 })).toMatchObject({ ran: false });
    } finally {
      server.close();
      db.markDbUp();
    }
  });

  it("gives the verified crawler a fingerprint no visitor can have, and deletes snapshots of deleted posts (Sprint 29)", async () => {
    const { fingerprint, CRAWLER_HEADER, CRAWLER_FINGERPRINT, CLIENT_IP_HEADER } = await import("@/lib/fingerprint");
    const h = new Headers({ [CLIENT_IP_HEADER]: "127.0.0.1", "user-agent": snaps.SNAPSHOT_UA });
    expect(fingerprint(h)).not.toBe(CRAWLER_FINGERPRINT);
    h.set(CRAWLER_HEADER, "1");
    expect(fingerprint(h)).toBe(CRAWLER_FINGERPRINT);

    const p = await posts.createPost({
      categorySlug: "supplements", nickname: "작성자", pin: "1234", title: "지울 글", body: "1정에 마그네슘 200mg 입니다.",
      summary: { lines: ["하나", "둘", "셋"], model: "author", isAuthorEdited: true }, fingerprint: "a".repeat(64),
    });
    await snaps.saveSnapshot(`/posts/${p.id}`, "<html><body>지울 글</body></html>");
    await posts.deletePost(p.id, "a".repeat(64), "1234");
    expect(await snaps.snapshotSavedAt(`/posts/${p.id}`)).toBeNull();
  });
});
