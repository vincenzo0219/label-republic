import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("hidden rooms (Sprint 81)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { listCategories, setRoomHidden } = await import("@/lib/repo/categories");
  const { listPosts } = await import("@/lib/repo/posts");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("keeps hidden rooms out of tabs and the home feed but not their own page", async () => {
    await query("TRUNCATE posts, categories RESTART IDENTITY CASCADE");
    const [a] = await query<{ id: number }>("INSERT INTO categories (slug, name, description) VALUES ('audio', '오디오', '') RETURNING id");
    const [h] = await query<{ id: number }>("INSERT INTO categories (slug, name, description) VALUES ('keyboards', '키보드', '') RETURNING id");
    expect(await setRoomHidden("keyboards", true)).toBe(true);
    expect(await setRoomHidden("nope", true)).toBe(false);
    for (const c of [a!.id, h!.id]) await query("INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type) VALUES ($1, 'n', 'x', 't', 'b', 'chat')", [c]);
    expect((await listCategories()).map((c) => c.slug)).toEqual(["audio"]);
    expect((await listCategories({ all: true })).map((c) => c.slug).sort()).toEqual(["audio", "keyboards"]);
    expect((await listPosts({ sort: "latest", page: 1, hideHiddenRooms: true })).items).toHaveLength(1);
    expect((await listPosts({ sort: "latest", page: 1 })).items).toHaveLength(2);
    expect((await listPosts({ sort: "latest", page: 1, categoryId: h!.id })).items).toHaveLength(1);
  });
});
