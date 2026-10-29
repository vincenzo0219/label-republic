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

    // 운영 계정 공감 (Sprint 79): 사람 댓글에만, 1분 뒤, 한 번. 이름은 따로, 사람 공감 수에는 안 섞임
    const { runOperatorLikes } = await import("@/lib/jobs/operatorLikes");
    await query("UPDATE comments SET author_fingerprint = 'fp1', created_at = now() - interval '5 minutes' WHERE id = $1", [c!.id]);
    await query("INSERT INTO comments (post_id, nickname, pw_hash, body, is_ai_curated) VALUES ($1, 'ai', 'x', 'ai', true)", [post!.id]);
    await query("INSERT INTO comments (post_id, nickname, pw_hash, body) VALUES ($1, '돈키호테', 'x', '운영 답글')", [post!.id]);
    // 10/29 대표님 "자동 공감 꺼": 기본은 꺼짐
    expect(await runOperatorLikes(new Date())).toBe(0);
    process.env.OPERATOR_LIKES_FORCE = "1";
    expect(await runOperatorLikes(new Date())).toBe(1);
    expect(await runOperatorLikes(new Date(Date.now() + 120_000))).toBe(0);
    delete process.env.OPERATOR_LIKES_FORCE;
    expect((await listComments(post!.id))[0]).toMatchObject({ likes: 1, liked_by: ["노방장"] });
    const w = await watchUpdates([], [], before, null, { comments: [c!.id] });
    expect(w).toMatchObject({ like_count: 1, liked_by: ["노방장"], total: 2 });
  });
});
