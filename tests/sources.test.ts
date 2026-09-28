import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { checkLink, extractTitle, isPublicAddress } from "@/lib/link-check";
import { classifySource, extractUrls, normalizeSourceUrl } from "@/lib/sources";

describe("source url rules", () => {
  it("normalizes: adds https, strips tracking params and fragments, lowercases host", () => {
    expect(normalizeSourceUrl("pubmed.ncbi.nlm.nih.gov/12345/")).toEqual({
      url: "https://pubmed.ncbi.nlm.nih.gov/12345/",
      host: "pubmed.ncbi.nlm.nih.gov",
      kind: "paper",
    });
    expect(normalizeSourceUrl(" https://WWW.MFDS.go.kr/brd/view.do?seq=1&utm_source=x&fbclid=y#top ").url).toBe("https://www.mfds.go.kr/brd/view.do?seq=1");
  });

  it("rejects unsafe, internal, shortened and affiliate links", () => {
    for (const bad of [
      "javascript:alert(1)",
      "ftp://example.com/a",
      "https://user:pw@example.com/",
      "http://example.com:8080/",
      "http://localhost/admin",
      "http://intranet/wiki",
      "http://10.0.0.5/",
      "http://192.168.0.1/",
      "http://127.0.0.1/",
      "http://0x7f000001/", // URL 파서가 127.0.0.1 로 바꾼다
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "https://bit.ly/abc",
      "https://link.coupang.com/a/xyz",
      "https://open.kakao.com/o/abc",
      `https://example.com/${"a".repeat(600)}`,
      "   ",
    ]) {
      expect(() => normalizeSourceUrl(bad), bad).toThrow();
    }
  });

  it("classifies by domain, not by claim", () => {
    expect(classifySource("doi.org")).toBe("paper");
    expect(classifySource("www.ncbi.nlm.nih.gov", "/pmc/articles/PMC1/")).toBe("paper");
    expect(classifySource("www.ncbi.nlm.nih.gov", "/books/")).toBe("gov");
    expect(classifySource("www.kci.go.kr")).toBe("paper"); // 학술지 색인은 공공 도메인보다 논문으로
    expect(classifySource("www.mfds.go.kr")).toBe("gov");
    expect(classifySource("www.fda.gov")).toBe("gov");
    expect(classifySource("efsa.europa.eu")).toBe("gov");
    expect(classifySource("m.blog.naver.com")).toBe("community");
    expect(classifySource("youtu.be")).toBe("community");
    expect(classifySource("example.com")).toBe("web");
    // 흉내 도메인은 속지 않는다
    expect(classifySource("notgov.com")).toBe("web");
    expect(classifySource("fakedoi.org")).toBe("web");
    expect(classifySource("doi.org.evil.example")).toBe("web");
  });

  it("extracts usable urls from post bodies", () => {
    const body = "식약처 고시(https://www.mfds.go.kr/a?b=1). 논문: https://doi.org/10.1000/xyz, 구매는 https://bit.ly/zz 참고. 다시 https://doi.org/10.1000/xyz";
    expect(extractUrls(body)).toEqual(["https://www.mfds.go.kr/a?b=1", "https://doi.org/10.1000/xyz"]);
  });
});

describe("link checker safety", () => {
  it("knows public vs internal addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) expect(isPublicAddress(ip), ip).toBe(true);
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "not-an-ip"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });

  it("extracts titles with charset and entities", () => {
    expect(extractTitle(Buffer.from("<html><head><title> 마그네슘 &amp; 아연 &#x2014; 식약처 </title>"), "text/html; charset=utf-8")).toBe("마그네슘 & 아연 — 식약처");
    const euckr = Buffer.concat([Buffer.from('<meta charset="euc-kr"><title>'), Buffer.from(new Uint8Array([0xc7, 0xd1, 0xb1, 0xdb])), Buffer.from("</title>")]);
    expect(extractTitle(euckr)).toBe("한글");
    expect(extractTitle(Buffer.from("<html>no title</html>"))).toBeUndefined();
  });

  let server: Server;
  let base = "";
  const hits: string[] = [];
  beforeAll(async () => {
    server = createServer((req, res) => {
      hits.push(req.url!);
      const u = req.url!;
      if (u === "/ok") res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end("<title>좋은 문서</title>");
      else if (u === "/big") {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(`<title>큰 문서</title>${"x".repeat(500_000)}`);
      } else if (u === "/pdf") res.writeHead(200, { "content-type": "application/pdf" }).end("%PDF");
      else if (u === "/gone") res.writeHead(410).end();
      else if (u === "/forbidden") res.writeHead(403).end();
      else if (u === "/redir") res.writeHead(301, { location: "/redir2" }).end();
      else if (u === "/redir2") res.writeHead(302, { location: `${base}/ok` }).end();
      else if (u === "/to-internal") res.writeHead(302, { location: "http://10.0.0.1/secret" }).end();
      else if (u === "/to-localhost") res.writeHead(302, { location: "http://localhost/" }).end();
      else if (u === "/loop") res.writeHead(302, { location: "/loop" }).end();
      else if (u === "/hang") return; // 응답하지 않음
      else res.writeHead(404).end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server.closeAllConnections();
    server.close();
  });
  const local = { allowAddress: (ip: string) => ip === "127.0.0.1", allowAnyPort: true, timeoutMs: 1500 };

  it("classifies responses", async () => {
    expect(await checkLink(`${base}/ok`, local)).toMatchObject({ outcome: "ok", httpStatus: 200, title: "좋은 문서" });
    expect(await checkLink(`${base}/big`, local)).toMatchObject({ outcome: "ok", title: "큰 문서" });
    expect(await checkLink(`${base}/pdf`, local)).toMatchObject({ outcome: "ok", title: undefined });
    expect(await checkLink(`${base}/gone`, local)).toMatchObject({ outcome: "gone", httpStatus: 410 });
    expect(await checkLink(`${base}/missing`, local)).toMatchObject({ outcome: "gone", httpStatus: 404 });
    expect(await checkLink(`${base}/forbidden`, local)).toMatchObject({ outcome: "inconclusive", httpStatus: 403 });
    expect(await checkLink(`${base}/redir`, local)).toMatchObject({ outcome: "ok", finalUrl: `${base}/ok` });
    expect(await checkLink(`${base}/loop`, local)).toMatchObject({ outcome: "inconclusive", error: "too many redirects" });
    expect(await checkLink(`${base}/hang`, { ...local, timeoutMs: 300 })).toMatchObject({ outcome: "inconclusive" });
  });

  it("never connects to internal addresses, even through redirects", async () => {
    // 기본 설정(공인 주소만)으로는 로컬 서버에 접속하지 않는다
    const before = hits.length;
    expect(await checkLink(`${base}/ok`, { allowAnyPort: true })).toMatchObject({ outcome: "blocked" });
    expect(hits.length).toBe(before);
    // 리다이렉트로 내부 주소를 가리키면 그 단계에서 차단
    expect(await checkLink(`${base}/to-internal`, local)).toMatchObject({ outcome: "blocked" });
    expect(await checkLink(`${base}/to-localhost`, { ...local, allowAddress: (ip) => ip === "127.0.0.1" && false })).toMatchObject({ outcome: "blocked" });
    expect(await checkLink("http://example.com:8080/", {})).toMatchObject({ outcome: "blocked" });
    expect(await checkLink("file:///etc/passwd", {})).toMatchObject({ outcome: "blocked" });
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("post sources (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const posts = await import("@/lib/repo/posts");
  const { runSourceCheckBatch } = await import("@/lib/jobs/sources");
  const { jobHealth } = await import("@/lib/repo/metrics");

  const newPost = (sources?: { url: string; label?: string }[], title = "출처 달린 글") =>
    posts.createPost({
      categorySlug: "supplements",
      nickname: "테스터",
      pin: "1234",
      title,
      body: "마그네슘 권장 섭취량 근거를 정리했습니다.",
      summary: { lines: ["하나", "둘", "셋"], model: "author", isAuthorEdited: true },
      sources,
    });
  const status = (postId: string) =>
    query<{ url: string; status: string; fail_count: number; page_title: string | null }>(
      "SELECT url, status, fail_count, page_title FROM post_sources WHERE post_id = $1 ORDER BY position",
      [postId],
    );

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
    await query("TRUNCATE posts, source_check_runs RESTART IDENTITY CASCADE");
  });
  afterAll(async () => {
    await pool().end();
  });

  it("stores normalized sources in order, deduped, with kinds on cards", async () => {
    const post = await newPost([
      { url: "https://www.mfds.go.kr/a?utm_source=x", label: "식약처 고시" },
      { url: "doi.org/10.1000/xyz" },
      { url: "https://www.mfds.go.kr/a" }, // 정규화하면 첫 번째와 같다
    ]);
    expect(post.sources.map((s) => [s.url, s.kind, s.label, s.status])).toEqual([
      ["https://www.mfds.go.kr/a", "gov", "식약처 고시", "unchecked"],
      ["https://doi.org/10.1000/xyz", "paper", "", "unchecked"],
    ]);
    await newPost(undefined, "출처 없는 글");
    const all = await posts.listPosts({ sort: "latest" });
    expect(all.items.map((p) => [p.title, p.source_count, [...p.source_kinds].sort()])).toEqual([
      ["출처 없는 글", 0, []],
      ["출처 달린 글", 2, ["gov", "paper"]],
    ]);
    expect((await posts.listPosts({ sort: "latest", sourced: true })).items.map((p) => p.title)).toEqual(["출처 달린 글"]);
    expect((await posts.listPosts({ sort: "latest", sourced: true, q: "마그네슘" })).items).toHaveLength(1);
  });

  it("rejects invalid sources and rolls back the whole post", async () => {
    await expect(newPost([{ url: "https://doi.org/1" }, { url: "http://192.168.0.1/" }])).rejects.toMatchObject({ status: 400, code: "invalid_source" });
    await expect(newPost(Array.from({ length: 9 }, (_, i) => ({ url: `https://example.com/${i}` })))).rejects.toMatchObject({ code: "too_many_sources" });
    expect((await query("SELECT count(*)::int AS n FROM posts"))[0]).toEqual({ n: 0 });
  });

  it("replaces sources on edit but keeps check results of unchanged links", async () => {
    const post = await newPost([{ url: "https://example.com/a" }, { url: "https://example.com/b" }]);
    await query("UPDATE post_sources SET status = 'ok', page_title = '문서 A' WHERE url = 'https://example.com/a'");
    const edited = await posts.updatePost(post.id, "f".repeat(64), "1234", {
      sources: [{ url: "https://example.com/c", label: "새 출처" }, { url: "https://example.com/a", label: "설명 추가" }],
    });
    expect(edited.sources.map((s) => [s.url, s.label, s.status, s.page_title])).toEqual([
      ["https://example.com/c", "새 출처", "unchecked", null],
      ["https://example.com/a", "설명 추가", "ok", "문서 A"],
    ]);
    // sources 를 보내지 않은 수정은 출처를 건드리지 않는다
    expect((await posts.updatePost(post.id, "f".repeat(64), "1234", { title: "제목만" })).sources).toHaveLength(2);
    // 블라인드 글은 출처도 숨긴다
    await query("UPDATE posts SET is_blinded = true WHERE id = $1", [post.id]);
    expect((await posts.getPost(post.id))!).toMatchObject({ sources: [], source_count: 0 });
  });

  it("checks links in batches: ok, broken after two definite failures, inconclusive unchanged, internal blocked", async () => {
    const post = await newPost([
      { url: "https://good.example/doc" },
      { url: "https://dead.example/doc" },
      { url: "https://flaky.example/doc" },
      { url: "https://sneaky.example/doc" },
    ]);
    const hidden = await newPost([{ url: "https://hidden.example/doc" }], "블라인드 글");
    await query("UPDATE posts SET is_blinded = true WHERE id = $1", [hidden.id]);
    const outcomes: Record<string, Awaited<ReturnType<typeof checkLink>>> = {
      "https://good.example/doc": { outcome: "ok", httpStatus: 200, title: "좋은 문서" },
      "https://dead.example/doc": { outcome: "gone", httpStatus: 404 },
      "https://flaky.example/doc": { outcome: "inconclusive", httpStatus: 503 },
      "https://sneaky.example/doc": { outcome: "blocked", error: "blocked address" },
    };
    const checked: string[] = [];
    const check = async (u: string) => (checked.push(u), outcomes[u]!);

    const now = new Date();
    expect(await runSourceCheckBatch(40, now, { check })).toEqual({ ran: true, checked: 4, broken: 1 });
    expect(checked.sort()).toEqual(Object.keys(outcomes).sort()); // 블라인드 글의 출처는 확인하지 않는다
    expect(await status(post.id)).toEqual([
      { url: "https://good.example/doc", status: "ok", fail_count: 0, page_title: "좋은 문서" },
      { url: "https://dead.example/doc", status: "unchecked", fail_count: 1, page_title: null },
      { url: "https://flaky.example/doc", status: "unchecked", fail_count: 0, page_title: null },
      { url: "https://sneaky.example/doc", status: "broken", fail_count: 2, page_title: null },
    ]);
    // 바로 다시 돌리면 확인할 때가 된 것이 없다
    expect((await runSourceCheckBatch(40, now, { check })).checked).toBe(0);
    // 하루 뒤: 죽은 링크는 두 번째 실패로 깨짐, 판단 보류는 그대로, 정상 링크는 7일 뒤까지 확인 안 함
    const later = new Date(now.getTime() + 25 * 3600_000);
    expect(await runSourceCheckBatch(40, later, { check })).toEqual({ ran: true, checked: 2, broken: 1 });
    expect((await status(post.id)).map((s) => s.status)).toEqual(["ok", "broken", "unchecked", "broken"]);
    // 고쳐지면 정상으로 돌아온다
    outcomes["https://dead.example/doc"] = { outcome: "ok", httpStatus: 200 };
    await runSourceCheckBatch(40, new Date(now.getTime() + 50 * 3600_000), { check });
    expect((await status(post.id))[1]).toMatchObject({ status: "ok", fail_count: 0 });
    expect((await jobHealth()).find((j) => j.job === "sources")).toMatchObject({ error: null });
  });
});
