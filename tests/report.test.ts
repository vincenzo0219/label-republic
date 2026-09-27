import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { extractiveDigest } from "@/lib/digest";
import { buildAtom, xmlEscape } from "@/lib/feed";
import { clampSince, parseBoards } from "@/lib/repo/report";

describe("report inputs", () => {
  const now = new Date("2026-09-27T12:00:00Z");
  it("clamps since to the last 30 days and defaults to 7", () => {
    expect(clampSince(null, now).toISOString()).toBe("2026-09-20T12:00:00.000Z");
    expect(clampSince("garbage", now).toISOString()).toBe("2026-09-20T12:00:00.000Z");
    expect(clampSince("2020-01-01T00:00:00Z", now).toISOString()).toBe("2026-08-28T12:00:00.000Z");
    expect(clampSince("2030-01-01T00:00:00Z", now).toISOString()).toBe(now.toISOString());
    expect(clampSince("2026-09-26T00:00:00Z", now).toISOString()).toBe("2026-09-26T00:00:00.000Z");
  });
  it("dedupes and caps board slugs", () => {
    expect(parseBoards(" a, b,a,,c ")).toEqual(["a", "b", "c"]);
    expect(parseBoards(Array.from({ length: 20 }, (_, i) => `b${i}`).join(","))).toHaveLength(10);
    expect(parseBoards(null)).toEqual([]);
  });
});

describe("digest and feed builders", () => {
  it("builds an extractive digest only from existing titles and summaries", () => {
    const d = extractiveDigest("영양제 성분분석", [
      { id: "1", title: "마그네슘 비교", summary: ["산화 60%, 구연산 16%"], net: 5 },
      { id: "2", title: "비타민D 단위", summary: ["1µg = 40IU"], net: 3 },
      { id: "3", title: "오메가3", summary: [], net: 1 },
      { id: "4", title: "제외될 글", summary: ["4번째"], net: 0 },
    ]);
    expect(d.postIds).toEqual(["1", "2", "3"]);
    expect(d.lines[0]).toBe("마그네슘 비교 — 산화 60%, 구연산 16%");
    expect(d.headline).toContain("영양제 성분분석");
    expect(d.model).toBe("extractive-digest-v1");
  });
  it("escapes XML and strips control characters", () => {
    expect(xmlEscape(`<a href="x">&'\u0001`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&apos;");
    const xml = buildAtom({
      id: "https://x/feed.xml",
      title: "T & <b>",
      subtitle: "s",
      selfUrl: "https://x/feed.xml",
      siteUrl: "https://x",
      alternateUrl: "https://x/",
      posts: [],
    });
    expect(xml).toContain("<title>T &amp; &lt;b&gt;</title>");
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("personalized report (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const posts = await import("@/lib/repo/posts");
  const report = await import("@/lib/repo/report");
  const { runDigestBatch } = await import("@/lib/jobs/digest");

  const create = (category: string, title: string, type: "info" | "chat" | "meetup" = "info") =>
    posts.createPost({
      categorySlug: category,
      nickname: "작성자",
      pin: "1234",
      title,
      body: "측정값과 성분표를 정리한 정보 글입니다.",
      summary: { lines: [`${title} 첫 줄`, "둘째 줄", "셋째 줄"], model: "author", isAuthorEdited: true },
      postType: type,
      fingerprint: "a".repeat(64),
      meetup: type === "meetup" ? { meetAt: new Date(Date.now() + 3 * 86400_000).toISOString(), location: "강남역", minParticipants: 3, capacity: 5 } : undefined,
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
    await query("TRUNCATE posts, board_digests, digest_runs RESTART IDENTITY CASCADE");
  });

  afterAll(async () => {
    await pool().end();
  });

  it("reports only new info/meetup posts from chosen boards since the last visit", async () => {
    const old = await create("supplements", "지난 글");
    await query("UPDATE posts SET created_at = now() - interval '3 days' WHERE id = $1", [old.id]);
    const since = new Date(Date.now() - 86400_000);
    await create("supplements", "새 정보 글");
    await create("supplements", "새 잡담", "chat");
    await create("supplements", "새 정모", "meetup");
    await create("keyboards", "관심 밖 보드 글");
    const spam = await create("supplements", "광고 글");
    await query("UPDATE posts SET is_suppressed = true WHERE id = $1", [spam.id]);

    const r = await report.buildReport(["supplements", "no-such-board"], since);
    expect(r.boards).toEqual([{ slug: "supplements", name: "영양제 성분분석", newCount: 2 }]);
    expect(r.total).toBe(2);
    expect(r.posts.map((p) => p.title).sort()).toEqual(["새 정모", "새 정보 글"]);
    expect(r.meetups.map((p) => p.title)).toEqual(["새 정모"]);
    expect(await report.countNew(["supplements", "keyboards"], since)).toBe(3);
    expect(await report.countNew([], since)).toBe(0);
    expect((await report.buildReport([], since)).posts).toEqual([]);
  });

  it("generates one shared digest per active board and does not regenerate within 20 hours", async () => {
    await create("supplements", "사람 글 A");
    await create("supplements", "사람 글 B");
    await create("keyboards", "잡담만", "chat");
    await query("UPDATE posts SET is_ai_curated = true WHERE title = '사람 글 B'");

    const r = await runDigestBatch();
    expect(r).toEqual({ ran: true, generated: ["supplements"] }); // 잡담만 있는 보드는 건너뜀
    const [dg] = await query<{ lines: string[]; post_ids: string[]; model_version: string }>("SELECT lines, post_ids::text[] AS post_ids, model_version FROM board_digests");
    expect(dg!.model_version).toBe("extractive-digest-v1"); // API 키 없음
    expect(dg!.lines).toEqual(["사람 글 A — 사람 글 A 첫 줄"]); // AI 큐레이터 글 제외
    expect((await runDigestBatch()).generated).toEqual([]);
    expect((await runDigestBatch(new Date(Date.now() + 21 * 3600_000))).generated).toEqual(["supplements"]);

    const cat = await query<{ id: number }>("SELECT id FROM categories WHERE slug = 'supplements'");
    expect((await report.latestDigest(cat[0]!.id))?.headline).toContain("영양제 성분분석");
    const rep = await report.buildReport(["supplements"], new Date(Date.now() - 86400_000));
    expect(rep.digests).toHaveLength(1);
  });

  it("skips the digest batch while another instance holds the lock", async () => {
    const other = await pool().connect();
    try {
      await other.query("SELECT pg_advisory_lock(4823004)");
      expect(await runDigestBatch()).toEqual({ ran: false, generated: [] });
    } finally {
      await other.query("SELECT pg_advisory_unlock(4823004)");
      other.release();
    }
  });

  it("feeds list newest info and meetup posts only", async () => {
    await create("supplements", "정보 <script>");
    await create("supplements", "잡담", "chat");
    await create("keyboards", "키보드 정보");
    const cat = await query<{ id: number }>("SELECT id FROM categories WHERE slug = 'supplements'");
    const items = await posts.listFeedPosts(cat[0]!.id);
    expect(items.map((p) => p.title)).toEqual(["정보 <script>"]);
    const xml = buildAtom({ id: "i", title: "t", subtitle: "s", selfUrl: "u", siteUrl: "https://x", alternateUrl: "a", posts: items });
    expect(xml).toContain("정보 &lt;script&gt;");
    expect(xml).not.toContain("<script>");
    expect((await posts.listFeedPosts()).length).toBe(2);
  });
});
