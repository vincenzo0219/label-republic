import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST_WELCOME_NAMES, postWelcome } from "@/lib/jobs/postWelcome";

describe("✍️ 새 글 환영 댓글 (문구)", () => {
  it("늘 울트라매니아 한 이름으로, 문장은 돌린다", () => {
    expect(postWelcome("3121", "민수", "1347").who).toBe("울트라매니아");
    expect(postWelcome("99", "환엄").who).toBe("울트라매니아");
    expect(postWelcome("3121", "민수", "1347").body).not.toBe(postWelcome("3121", "민수", "1348").body);
    expect(POST_WELCOME_NAMES).not.toContain("노방장");
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("✍️ 새 글 환영 댓글 (DB)", async () => {
  process.env.DATABASE_URL = url;
  process.env.POST_WELCOME_ENABLED = "1";
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
      (await query<{ id: string }>(`INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type, author_fingerprint${extra ? ", seed_key" : ""}, created_at) VALUES ($1, $2, 'x', 't', 'b', 'chat', 'fp', ${extra ? "$3," : ""} now() - interval '70 seconds') RETURNING id::text`, extra ? [cat!.id, nick, extra] : [cat!.id, nick]))[0]!.id;
    const human = await add("손님");
    await add("노방장");
    await add("손님2", "roomchat:tennis:1");
    expect(await runPostWelcome()).toBe(1);
    expect(await runPostWelcome()).toBe(0);
    const c = await query<{ nickname: string; body: string }>("SELECT nickname, body FROM comments WHERE post_id = $1", [human]);
    expect(c).toHaveLength(1);
    expect(POST_WELCOME_NAMES).toContain(c[0]!.nickname);
    // 댓글: 한 글에서 한 사람에게 한 번만 (운영 답글에 다시 답해도 또 달지 않음)
    const [c1] = await query<{ id: string }>("INSERT INTO comments (post_id, nickname, pw_hash, body, author_fingerprint, created_at) VALUES ($1, '대니', 'x', '안녕', 'fpc', now() - interval '70 seconds') RETURNING id::text", [human]);
    expect(await runPostWelcome()).toBe(1);
    const r1 = await query<{ parent_id: string }>("SELECT parent_id::text FROM comments WHERE post_id = $1 AND parent_id IS NOT NULL", [human]);
    expect(r1.map((r) => r.parent_id)).toEqual([c1!.id]);
    // 글에 처음 단 이름을 이어서 쓴다
    const names = await query<{ nickname: string }>("SELECT DISTINCT nickname FROM comments WHERE post_id = $1 AND parent_id IS NOT NULL OR (post_id = $1 AND nickname = $2)", [human, c[0]!.nickname]);
    expect(names.map((n) => n.nickname)).toEqual([c[0]!.nickname]);
    await query("INSERT INTO comments (post_id, nickname, pw_hash, body, author_fingerprint, created_at) VALUES ($1, '대니', 'x', '고마워요', 'fpc', now() - interval '65 seconds')", [human]);
    expect(await runPostWelcome()).toBe(0);
    // 글쓴이가 자기 글에 댓글을 달아도 또 달지 않는다, 막 쓴 글(10초)은 아직 기다린다
    await query("INSERT INTO comments (post_id, nickname, pw_hash, body, author_fingerprint, created_at) VALUES ($1, '손님', 'x', '저도요', 'fp', now() - interval '70 seconds')", [human]);
    await query(`INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type, author_fingerprint, created_at) VALUES ($1, '새손님', 'x', 't', 'b', 'chat', 'fp9', now() - interval '10 seconds')`, [cat!.id]);
    expect(await runPostWelcome()).toBe(0);
    // 대표님 휴대폰 이름에는 달지 않는다
    await add("김하연작가");
    expect(await runPostWelcome()).toBe(0);
    process.env.POST_WELCOME_ENABLED = "0";
    await add("손님3");
    expect(await runPostWelcome()).toBe(0);
    process.env.POST_WELCOME_ENABLED = "1";
  });
});
