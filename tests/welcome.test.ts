import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("first comment welcome (Sprint 92)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { runWelcome, welcomeText } = await import("@/lib/jobs/welcome");
  const { BOOK_ROOM_SLUG } = await import("@/lib/books");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("welcomes a browser's first comment once, a minute later", async () => {
    const [cat] = await query<{ id: number }>("INSERT INTO categories (slug, name, description) VALUES ($1, '책방', '') RETURNING id", [BOOK_ROOM_SLUG]);
    const [post] = await query<{ id: string }>("INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type) VALUES ($1, 'n', 'x', 't', 'b', 'chat') RETURNING id::text", [cat!.id]);
    const add = (nick: string, fp: string | null, ago: string) =>
      query<{ id: string }>(
        `INSERT INTO comments (post_id, nickname, pw_hash, body, author_fingerprint, created_at) VALUES ($1, $2, 'x', '안녕', $3, now() - $4::interval) RETURNING id::text`,
        [post!.id, nick, fp, ago],
      );
    const [first] = await add("대니", "fp1", "5 minutes");
    await add("대니", "fp1", "3 minutes"); // 두 번째 댓글은 건너뜀
    await add("새손님", "fp2", "10 seconds"); // 아직 1분 안 됨
    await add("옛손님", "fp3", "2 hours"); // 너무 오래됨
    await add("노방장", "fp4", "5 minutes"); // 운영 계정
    expect(await runWelcome(new Date())).toBe(1);
    expect(await runWelcome(new Date())).toBe(0);
    const [r] = await query<{ nickname: string; body: string; parent_id: string }>("SELECT nickname, body, parent_id::text FROM comments WHERE parent_id IS NOT NULL");
    expect(r).toMatchObject({ nickname: "돈키호테", parent_id: first!.id });
    expect(r!.body).toContain("대니님");
    expect(welcomeText({ nickname: "a", post_id: "1", chat: true })).toContain("아무 얘기");
    expect(welcomeText({ nickname: "a", post_id: "3126", chat: false })).toContain("같은 타입");
  });
});
