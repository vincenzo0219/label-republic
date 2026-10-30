import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { postWelcome } from "@/lib/jobs/postWelcome";

describe("✍️ 새 글 환영 댓글 (문구)", () => {
  it("동탄맨·울트라매니아를 번갈아, 문장도 돌린다", () => {
    expect(postWelcome("10", "철수").who).toBe("동탄맨");
    expect(postWelcome("11", "철수").who).toBe("울트라매니아");
    expect(postWelcome("10", "철수").body).not.toBe(postWelcome("12", "철수").body);
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("✍️ 새 글 환영 댓글 (DB)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { runPostWelcome } = await import("@/lib/jobs/postWelcome");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("사람 새 글에만 한 번, 운영·시스템 글은 건너뛴다", async () => {
    const [cat] = await query<{ id: number }>("INSERT INTO categories (slug, name, description) VALUES ('tennis', '테니스방', '') RETURNING id");
    const add = async (nick: string, extra = "") =>
      (await query<{ id: string }>(`INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type, author_fingerprint${extra ? ", seed_key" : ""}, created_at) VALUES ($1, $2, 'x', 't', 'b', 'chat', 'fp', ${extra ? "$3," : ""} now() - interval '5 seconds') RETURNING id::text`, extra ? [cat!.id, nick, extra] : [cat!.id, nick]))[0]!.id;
    const human = await add("손님");
    await add("노방장");
    await add("손님2", "roomchat:tennis:1");
    expect(await runPostWelcome()).toBe(1);
    expect(await runPostWelcome()).toBe(0);
    const c = await query<{ nickname: string; body: string }>("SELECT nickname, body FROM comments WHERE post_id = $1", [human]);
    expect(c).toHaveLength(1);
    expect(["동탄맨", "울트라매니아"]).toContain(c[0]!.nickname);
    process.env.POST_WELCOME_ENABLED = "0";
    await add("손님3");
    expect(await runPostWelcome()).toBe(0);
    delete process.env.POST_WELCOME_ENABLED;
  });
});
