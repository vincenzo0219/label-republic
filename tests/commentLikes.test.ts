import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("comment likes (Sprint 78)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { toggleLike } = await import("@/lib/repo/commentLikes");
  const { listComments } = await import("@/lib/repo/comments");
  const { watchUpdates } = await import("@/lib/repo/watch");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("counts one like per visitor and reports new likes on my comments", async () => {
    const [cat] = await query<{ id: number }>("INSERT INTO categories (slug, name, description) VALUES ('books', '책방', '') RETURNING id");
    const [post] = await query<{ id: string }>("INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type) VALUES ($1, 'n', 'x', 't', 'b', 'chat') RETURNING id::text", [cat!.id]);
    const [c] = await query<{ id: string }>("INSERT INTO comments (post_id, nickname, pw_hash, body) VALUES ($1, '대니', 'x', '8/10') RETURNING id::text", [post!.id]);
    const before = new Date(Date.now() - 1000);
    expect(await toggleLike(c!.id, "v1", true)).toBe(1);
    expect(await toggleLike(c!.id, "v1", true)).toBe(1);
    expect(await toggleLike(c!.id, "v2", true)).toBe(2);
    expect(await toggleLike(c!.id, "v2", false)).toBe(1);
    expect((await listComments(post!.id))[0]).toMatchObject({ id: c!.id, likes: 1 });
    const u = await watchUpdates([], [], before, null, { comments: [c!.id] });
    expect(u).toMatchObject({ like_count: 1, total: 1 });
    expect((await watchUpdates([], [], new Date(), null, { comments: [c!.id] })).like_count).toBe(0);
    await expect(toggleLike("999", "v1", true)).rejects.toMatchObject({ status: 404 });
  });
});
