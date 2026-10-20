import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("test rankings + yesterday poll line (Sprint 95)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { testRanking } = await import("@/lib/repo/testRanks");
  const { kstMidnight, rankHrefFor } = await import("@/lib/testRanks");
  const { yesterdayLine } = await import("@/lib/jobs/roomPolls");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("counts only results left before midnight, by team then type", async () => {
    const [cat] = await query<{ id: number }>("INSERT INTO categories (slug, name, description) VALUES ('k리그-덕후방', 'K리그', '') RETURNING id");
    const [post] = await query<{ id: string }>("INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type) VALUES ($1, 'n', 'x', 't', 'b', 'chat') RETURNING id::text", [cat!.id]);
    const add = (nick: string, body: string, ago: string) =>
      query("INSERT INTO comments (post_id, nickname, pw_hash, body, author_fingerprint, created_at) VALUES ($1, $2, 'x', $3, $6, $4::timestamptz - $5::interval)", [post!.id, nick, body, kstMidnight().toISOString(), ago, nick]);
    await add("a", "⚽ 축구 팬 테스트: 🚌 원정 직관러 / 응원 팀: 수원삼성", "1 hour");
    await add("b", "⚽ 축구 팬 테스트: 🚌 원정 직관러 / 응원 팀: 수원삼성블루윙즈", "2 hours");
    await add("c", "⚽ 축구 팬 테스트: 📊 전술 분석가 / 응원 팀: FC서울", "3 hours");
    await add("d", "⚽ 축구 팬 테스트: 📊 전술 분석가 / 응원 팀: FC서울", "-1 hour"); // 오늘 — 내일 반영
    await add("노방장", "운영 답글", "1 hour");
    const r = await testRanking(post!.id, kstMidnight());
    expect(r.total).toBe(3);
    expect(r.teams).toEqual([{ name: "수원삼성", n: 2 }, { name: "FC서울", n: 1 }]);
    expect(r.types[0]).toEqual({ label: "🚌 원정 직관러", n: 2 });
    expect(rankHrefFor("3121")).toBe("/rank/fan");
    expect(rankHrefFor("9")).toBeUndefined();
  });

  it("writes yesterday's human vote split into today's poll", async () => {
    const [cat] = await query<{ id: number }>("SELECT id FROM categories WHERE slug = 'k리그-덕후방'");
    const [p] = await query<{ id: string }>("INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type, seed_key) VALUES ($1, 'q', 'x', 't', 'b', 'chat', 'roompoll:k리그-덕후방:2026-10-19') RETURNING id::text", [cat!.id]);
    await query("INSERT INTO debate_votes (post_id, visitor_hash, side) VALUES ($1, 'v1', 'A'), ($1, 'v2', 'A'), ($1, 'v3', 'B')", [p!.id]);
    expect(await yesterdayLine("k리그-덕후방", "2026-10-20")).toBe("📊 어제 결과: 직관 67% vs 중계 33% (3명)\n\n");
    expect(await yesterdayLine("k리그-덕후방", "2026-10-22")).toBe("");
  });
});
