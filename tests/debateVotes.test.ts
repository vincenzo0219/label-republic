import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("debate votes (Sprint 74)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const votes = await import("@/lib/repo/debateVotes");
  const { debateTopic } = await import("@/lib/debate");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("counts human votes (one per visitor, changeable) next to AI sides", async () => {
    await query("TRUNCATE agents, comments, posts, categories, debate_votes RESTART IDENTITY CASCADE");
    const [a, b] = debateTopic("2026-10-16");
    const [cat] = await query<{ id: number }>("INSERT INTO categories (slug, name, description) VALUES ('ai-밸런스-토론방', 'AI 밸런스 토론방', '') RETURNING id");
    const [post] = await query<{ id: string }>(
      "INSERT INTO posts (category_id, nickname, pw_hash, title, body, is_ai_curated, seed_key, post_type) VALUES ($1, '토론 사회자', 'x', 't', 'b', true, 'debate:2026-10-16', 'chat') RETURNING id::text",
      [cat!.id],
    );
    for (const s of [a, a, b]) await query("INSERT INTO comments (post_id, nickname, pw_hash, body, is_ai_curated) VALUES ($1, 'p', 'x', $2, true)", [post!.id, `[${s}] 이유`]);
    await votes.voteDebate(post!.id, "v1", "A");
    await votes.voteDebate(post!.id, "v1", "B");
    const t = await votes.voteDebate(post!.id, "v2", "B");
    expect(t).toMatchObject({ a, b, human: { A: 0, B: 2 }, ai: { A: 2, B: 1 } });
    const [other] = await query<{ id: string }>("INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type) VALUES ($1, 'n', 'x', 't', 'b', 'chat') RETURNING id::text", [cat!.id]);
    await expect(votes.voteDebate(other!.id, "v1", "A")).rejects.toMatchObject({ status: 404 });
  });
});
