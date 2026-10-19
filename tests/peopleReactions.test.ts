import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, expect, it, describe } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("사람끼리 반응 (Sprint 87)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { peopleReactions } = await import("@/lib/repo/metrics");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  }, 30_000);
  afterAll(async () => {
    await pool().end();
  });

  it("counts people answering people, not operators or AI", async () => {
    const fp = (c: string) => c.repeat(64);
    await query("INSERT INTO categories (slug, name, description) VALUES ('r', '방', '')");
    const t = "2026-10-19 12:00:00+09";
    const [post] = await query<{ id: string }>(
      `INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type, author_fingerprint, created_at) VALUES (1, '민', 'x', '질문', '본문입니다 열 글자', 'chat', $1, $2) RETURNING id::text`,
      [fp("a"), t],
    );
    const ins = async (nick: string, f: string | null, parent: string | null, ai = false) =>
      (await query<{ id: string }>(
        `INSERT INTO comments (post_id, nickname, pw_hash, body, author_fingerprint, parent_id, is_ai_curated, created_at) VALUES ($1, $2, 'x', '댓글', $3, $4, $5, $6) RETURNING id::text`,
        [post!.id, nick, f, parent, ai, t],
      ))[0]!.id;
    const c1 = await ins("철", fp("b"), null); // 사람 글에 다른 사람 댓글 → 1
    await ins("노방장", null, c1); // 운영 답글 → 제외
    await ins("민", fp("a"), c1); // 사람 답글 → 1, c1 은 사람 답을 받음
    await ins("철", fp("b"), null); // 자기 글 아님 → 사람 글에 댓글 → 1
    await ins("AI", null, null, true);
    await query("INSERT INTO comment_likes (comment_id, visitor_hash, created_at) VALUES ($1, 'v', $2)", [c1, t]);
    const [day] = await peopleReactions("2026-10-19", 1);
    expect(day).toMatchObject({ day: "2026-10-19", human: 3, h2h: 3, likes: 1, ops: 2 });
    expect(day!.answered).toBeCloseTo(33.3, 1);
  });
});
