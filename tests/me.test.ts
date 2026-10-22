import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("마이페이지 (10/22)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { hashPin, verifyPin } = await import("@/lib/password");
  const { myActivity, renameMine, changeMyPin } = await import("@/lib/repo/me");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("lists, renames and re-pins only what the pin opens", async () => {
    const [cat] = await query<{ id: number }>("INSERT INTO categories (slug, name, description) VALUES ('m', '방', '') RETURNING id");
    const h1 = await hashPin("1111");
    const h2 = await hashPin("2222");
    const post = (nick: string, h: string) =>
      query<{ id: string }>("INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type) VALUES ($1, $2, $3, '제목', '본문', 'chat') RETURNING id::text", [cat!.id, nick, h]);
    const [mine] = await post("나", h1);
    const [other] = await post("남", h2);
    const [c] = await query<{ id: string }>("INSERT INTO comments (post_id, nickname, pw_hash, body) VALUES ($1, '나', $2, '댓글') RETURNING id::text", [other!.id, h1]);

    const act = await myActivity([mine!.id, other!.id], [c!.id], "f".repeat(64));
    expect(act.posts.map((p) => p.id).sort()).toEqual([mine!.id, other!.id].sort());
    expect(act.comments[0]).toMatchObject({ id: c!.id, post_title: "제목" });

    expect(await renameMine("1111", "새이름", [mine!.id, other!.id], [c!.id], "a".repeat(64))).toEqual({ posts: 1, comments: 1 });
    const names = await query<{ nickname: string }>("SELECT nickname FROM posts ORDER BY id");
    expect(names.map((r) => r.nickname)).toEqual(["새이름", "남"]);

    expect(await changeMyPin("1111", "3333", [mine!.id, other!.id], [c!.id], "b".repeat(64))).toEqual({ posts: 1, comments: 1 });
    const [p] = await query<{ pw_hash: string }>("SELECT pw_hash FROM posts WHERE id = $1", [mine!.id]);
    expect(await verifyPin("3333", p!.pw_hash)).toBe(true);
    const [o] = await query<{ pw_hash: string }>("SELECT pw_hash FROM posts WHERE id = $1", [other!.id]);
    expect(await verifyPin("2222", o!.pw_hash)).toBe(true);
  });
});
