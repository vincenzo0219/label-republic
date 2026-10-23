import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("posts with many comments rise in the feed (10/22)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { listPosts, FEED_HOT_COMMENTS } = await import("@/lib/repo/posts");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("puts a post past the comment line first, except in latest", async () => {
    const [cat] = await query<{ id: number }>("INSERT INTO categories (slug, name, description) VALUES ('hot', 'hot', '') RETURNING id");
    const add = (title: string, ago: string) =>
      query<{ id: string }>(
        "INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type, created_at) VALUES ($1, 'n', 'x', $2, 'b', 'chat', now() - $3::interval) RETURNING id::text",
        [cat!.id, title, ago],
      );
    const [old] = await add("old busy", "3 days");
    await add("new quiet", "1 minute");
    for (let i = 0; i < FEED_HOT_COMMENTS; i++) await query("INSERT INTO comments (post_id, nickname, pw_hash, body) VALUES ($1, 'c', 'x', 'hi')", [old!.id]);
    for (const sort of ["trust", "votes"] as const) {
      const feed = await listPosts({ categoryId: cat!.id, sort, page: 1 });
      expect(feed.items[0]!.title).toBe("old busy");
    }
    const home = await listPosts({ sort: "trust", page: 1, humanFirst: true });
    expect(home.items[0]!.title).toBe("old busy");
    const latest = await listPosts({ categoryId: cat!.id, sort: "latest", page: 1 });
    expect(latest.items[0]!.title).toBe("new quiet");
    // 방 피드(기본 최신순)에서도 맨 위로
    const room = await listPosts({ categoryId: cat!.id, sort: "latest", page: 1, hotFirst: true });
    expect(room.items[0]!.title).toBe("old busy");
    // 탭(유형·말머리)에서는 시간순 (10/23)
    const tab = await listPosts({ categoryId: cat!.id, sort: "latest", page: 1, type: "chat", hotFirst: false });
    expect(tab.items[0]!.title).toBe("new quiet");
  });

  it("행사 탭은 [혜택] 핫딜·할인 글도 함께 보여 준다 (10/23)", async () => {
    const [cat] = await query<{ id: number }>("INSERT INTO categories (slug, name, description) VALUES ('ev', 'ev', '') RETURNING id");
    for (const t of ["[행사] 박람회", "[혜택] 쿠폰", "[자랑] 사진"])
      await query("INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type) VALUES ($1, 'n', 'x', $2, 'b', 'chat')", [cat!.id, t]);
    const ev = await listPosts({ categoryId: cat!.id, sort: "latest", page: 1, head: "행사" });
    expect(ev.items.map((p) => p.title).sort()).toEqual(["[행사] 박람회", "[혜택] 쿠폰"]);
    const deal = await listPosts({ categoryId: cat!.id, sort: "latest", page: 1, head: "혜택" });
    expect(deal.items.map((p) => p.title)).toEqual(["[혜택] 쿠폰"]);
  });
});

