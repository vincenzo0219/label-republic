import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("room filter counts (Sprint 93)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { filterCounts } = await import("@/lib/repo/categories");
  const { HEADS } = await import("@/lib/heads");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("counts new posts per head, info and meetup since a time", async () => {
    const [cat] = await query<{ id: number }>("INSERT INTO categories (slug, name, description) VALUES ('dogs', '반려견', '') RETURNING id");
    const add = (title: string, type: string, ago: string) =>
      query("INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type, created_at) VALUES ($1, 'n', 'x', $2, 'b', $3::post_type, now() - $4::interval)", [cat!.id, title, type, ago]);
    await add("[행사] 펫페어", "chat", "1 hour");
    await add("[행사] 산책 모임", "chat", "2 hours");
    await add("[자랑] 우리 개", "chat", "3 hours");
    await add("성분 비교", "info", "1 hour");
    await add("[행사] 오래된 글", "chat", "3 days");
    const keys = HEADS.map((h) => h.key);
    // 자유채팅(방 수다방) 새 말도 센다
    const [chat] = await query<{ id: string }>("INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type, seed_key) VALUES ($1, 'n', 'x', '💬 수다방', 'b', 'chat', 'roomchat:dogs') RETURNING id", [cat!.id]);
    await query("INSERT INTO comments (post_id, nickname, pw_hash, body) VALUES ($1, 'a', 'x', '안녕')", [chat!.id]);
    expect(await filterCounts("dogs", new Date(Date.now() - 86_400_000), keys)).toEqual({ 행사: 2, 자랑: 1, info: 1, chat: 1 });
    expect(await filterCounts("dogs", new Date(), keys)).toEqual({});
    expect(await filterCounts("none", new Date(0), keys)).toEqual({});
  });
});
