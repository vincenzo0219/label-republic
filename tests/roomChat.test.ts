import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHAT_TOPICS, chatTopic } from "@/lib/chatTopics";

describe("today's chat topic (Sprint 85)", () => {
  it("rotates daily and wraps", () => {
    expect(chatTopic("2026-10-19")).toBe(CHAT_TOPICS[0]);
    expect(chatTopic("2026-10-20")).toBe(CHAT_TOPICS[1]);
    expect(chatTopic("2026-10-18")).toBe(CHAT_TOPICS.at(-1));
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("room chat (Sprint 84)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { ensureRoomChat, searchRoomChat } = await import("@/lib/repo/roomChat");
  const { listComments } = await import("@/lib/repo/comments");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("keeps one chat per room, searchable, and lists the latest 1000 oldest-first", async () => {
    await query("TRUNCATE posts RESTART IDENTITY CASCADE");
    await query("INSERT INTO categories (slug, name, description) VALUES ('비바리움-덕후방', '비바리움', '')");
    const a = await ensureRoomChat("비바리움-덕후방");
    expect(a).toMatchObject({ name: "비바리움" });
    expect((await ensureRoomChat("비바리움-덕후방"))?.postId).toBe(a!.postId);
    expect(await ensureRoomChat("없는-방")).toBeNull();
    expect(await ensureRoomChat("전체")).toMatchObject({ name: "전체" });

    await query(
      `INSERT INTO comments (post_id, nickname, pw_hash, body) SELECT $1, '덕후' || g, 'x', '크레 먹이 ' || g FROM generate_series(1, 1005) g`,
      [a!.postId],
    );
    const list = await listComments(a!.postId);
    expect(list).toHaveLength(1000);
    expect(list[0]!.body).toBe("크레 먹이 6");
    expect(list.at(-1)!.body).toBe("크레 먹이 1005");

    const hits = await searchRoomChat(["크레", "1005"]);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ slug: "비바리움-덕후방", room: "비바리움", nickname: "덕후1005" });
    expect(await searchRoomChat(["a"])).toEqual([]);

    const { listPosts } = await import("@/lib/repo/posts");
    await query("INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type) SELECT id, 'a', 'x', '[질문] 크레 먹이 추천?', '본문입니다 열 글자', 'chat' FROM categories WHERE slug = '비바리움-덕후방'");
    const [cat] = await query<{ id: number }>("SELECT id FROM categories WHERE slug = '비바리움-덕후방'");
    const qs = await listPosts({ categoryId: cat!.id, sort: "latest", head: "질문" });
    expect(qs.items.map((p) => p.title)).toEqual(["[질문] 크레 먹이 추천?"]);
  });
});
