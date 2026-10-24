import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, expect, it, describe } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("읽는 사람 비율", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { parsePath, recordPageView } = await import("@/lib/metrics");
  const { readerDaily, readerPeriod } = await import("@/lib/repo/metrics");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  }, 30_000);
  afterAll(async () => {
    await pool().end();
  });

  const fp = (c: string) => c.repeat(64);
  const view = (v: string, p: string, at: string) =>
    recordPageView({ visitorHash: fp(v), path: parsePath(p)!, source: "direct", referrerHost: null, landing: false, now: new Date(at) });
  const post = async (f: string | null, at: string) =>
    (
      await query<{ id: string }>(
        `INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type, author_fingerprint, is_ai_curated, created_at)
         VALUES (1, '민', 'x', '제목', '본문입니다 열 글자', 'chat', $1, $2, $3) RETURNING id::text`,
        [f, f == null, at],
      )
    )[0]!.id;
  const comment = (postId: string, f: string | null, at: string) =>
    query(`INSERT INTO comments (post_id, nickname, pw_hash, body, author_fingerprint, is_ai_curated, created_at) VALUES ($1, '철', 'x', '댓글', $2, $3, $4)`, [
      postId,
      f,
      f == null,
      at,
    ]);

  it("counts readers, contributors, lurkers (clamped) and bounces per KST day", async () => {
    await query("INSERT INTO categories (slug, name, description) VALUES ('r', '방', '')");
    const p1 = await post(null, "2026-10-10T00:00:00Z"); // AI 글: 참여 아님
    // 10-19 KST
    await view("d", `/posts/${p1}`, "2026-10-19T14:59:00Z"); // 10-19 23:59 KST
    await view("e", `/posts/${p1}`, "2026-10-19T03:00:00Z");
    await comment(p1, fp("x"), "2026-10-19T14:50:00Z"); // 10-19 23:50 KST
    // 10-20 KST
    await view("a", `/posts/${p1}`, "2026-10-19T15:30:00Z"); // 10-20 00:30 KST
    await view("a", "/", "2026-10-20T01:00:00Z");
    await view("b", "/", "2026-10-20T02:00:00Z"); // 바로 나감
    await view("b", "/c/r", "2026-10-20T02:01:00Z");
    await view("c", `/posts/${p1}`, "2026-10-20T03:00:00Z");
    await comment(p1, fp("x"), "2026-10-19T15:10:00Z"); // 10-20 00:10 KST
    await comment(p1, null, "2026-10-20T04:00:00Z"); // AI 댓글: 제외
    await query("INSERT INTO votes (post_id, voter_fingerprint, value, created_at) VALUES ($1, $2, 1, $4), ($1, $3, -1, $4)", [
      p1,
      fp("y"),
      fp("z"),
      "2026-10-20T05:00:00Z",
    ]);
    await post(fp("w"), "2026-10-20T06:00:00Z");
    // 범위 밖 (10-21 KST)
    await view("f", `/posts/${p1}`, "2026-10-20T15:00:00Z");

    const rows = await readerDaily("2026-10-20", 7);
    expect(rows).toHaveLength(7);
    expect(rows[0]).toEqual({ day: "2026-10-20", visitors: 3, readers: 2, contributors: 4, lurkers: 0, bounced: 1 });
    expect(rows[1]).toEqual({ day: "2026-10-19", visitors: 2, readers: 2, contributors: 1, lurkers: 1, bounced: 0 });
    expect(rows[6]).toEqual({ day: "2026-10-14", visitors: 0, readers: 0, contributors: 0, lurkers: 0, bounced: 0 });

    // 기간은 일별 합이 아니라 고유 인원 (x 는 이틀 모두 참여 → 1명)
    expect(await readerPeriod("2026-10-20", 7)).toMatchObject({ visitors: 5, readers: 4, contributors: 4, lurkers: 0, bounced: 1 });
    expect(await readerPeriod("2026-10-19", 28)).toMatchObject({ visitors: 2, readers: 2, contributors: 1, lurkers: 1, bounced: 0 });
  });
});
