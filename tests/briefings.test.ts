import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

// 📰 오늘 브리핑 (10/27): 노방장 [정보] 글 제목 꼬리말로 종류를 가른다
d("📰 room briefings", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { roomBriefings } = await import("@/lib/repo/briefings");
  const dir = path.join(process.cwd(), "db", "migrations");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
    await query("INSERT INTO categories (slug, name) VALUES ('주식', '주식') ON CONFLICT (slug) DO NOTHING");
  }, 120_000);
  afterAll(async () => {
    await pool().end();
  });
  const add = (title: string, nick = "노방장", ago = "0 hours") =>
    query(
      `INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type, created_at)
       SELECT id, $2, 'x', $1, '본문입니다 열 글자 넘게', 'info', now() - $3::interval FROM categories WHERE slug = '주식'`,
      [title, nick, ago],
    );
  it("종류마다 가장 최근 하나, 속보는 오늘 것만, 사람 글은 빼고", async () => {
    await add("[정보] 10/26 장 마감 | 어제", "노방장", "1 day");
    await add("[정보] 10/27 장 마감 | 매수 사이드카");
    await add("[정보] 속보 10/26 | 어제 속보", "노방장", "1 day");
    await add("[정보] 10/27 장 전 | 사람이 쓴 척", "개미");
    const b = await roomBriefings("주식");
    expect(b.map((x) => [x.key, x.title])).toEqual([["close", "10/27 장 마감 | 매수 사이드카"]]);
    expect(b[0]!.today).toBe(true);
    expect(await roomBriefings("러닝-덕후방")).toEqual([]);
  });
});
