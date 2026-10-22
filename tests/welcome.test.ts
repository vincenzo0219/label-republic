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
    expect(await runWelcome(new Date(), 1)).toBe(1);
    expect(await runWelcome(new Date(), 1)).toBe(0);
    const [r] = await query<{ nickname: string; body: string; parent_id: string }>("SELECT nickname, body, parent_id::text FROM comments WHERE parent_id IS NOT NULL");
    expect(r).toMatchObject({ parent_id: first!.id });
    expect(["노방장", "돈키호테", "덕후1호"]).toContain(r!.nickname);
    expect(r!.body).toContain("대니님");
    expect(welcomeText({ nickname: "a", post_id: "1", chat: true })).toContain("a님");
    expect(welcomeText({ nickname: "a", post_id: "3126", chat: false })).toContain("a님 결과");
    expect(welcomeText({ nickname: "a", post_id: "3121", chat: false }, { nickname: "1983", why: "team", label: "FC서울" })).toContain("@1983님도 FC서울 팬");
    // 닉네임마다 말투가 다르고, 이모지·느낌표 없이 짧게
    expect(welcomeText({ nickname: "a", post_id: "1", chat: true }, null, 0, "덕후1호")).toBe("오 a님 왔다");
    for (const who of ["노방장", "돈키호테", "덕후1호"])
      for (let v = 0; v < 4; v++) {
        const t = welcomeText({ nickname: "a", post_id: "3121", chat: false }, { nickname: "b", why: "team", label: "FC서울" }, v, who);
        expect(t).toContain("@b님");
        expect(t).not.toMatch(/[!👋⚡🙌👀]/u);
      }
    expect(welcomeText({ nickname: "a", post_id: "3121", chat: false, body: "⚽ 축구 팬 테스트: 👕 굿즈 수집가 / 응원 팀: 강원FC" })).toContain("👕 굿즈 수집가");
    // 표현을 돌려 써서 연달아 같은 문장이 붙지 않는다
    const b = "⚽ 축구 팬 테스트: 📊 전술 분석가 / 응원 팀: 경남fc";
    const texts = new Set([0, 1, 2, 3].map((v) => welcomeText({ nickname: "a", post_id: "3121", chat: false, body: b }, null, v)));
    expect(texts.size).toBe(4);
  });

  it("welcomes only about one in four first comments", async () => {
    const [cat] = await query<{ id: number }>("INSERT INTO categories (slug, name, description) VALUES ('q4', 'q', '') RETURNING id");
    const [post] = await query<{ id: string }>("INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type) VALUES ($1, 'n', 'x', 't', 'b', 'chat') RETURNING id::text", [cat!.id]);
    for (let i = 0; i < 8; i++)
      await query(`INSERT INTO comments (post_id, nickname, pw_hash, body, author_fingerprint, created_at) VALUES ($1, $2, 'x', '안녕', $3, now() - interval '5 minutes')`, [post!.id, `q${i}`, `q4fp${i}`]);
    expect(await runWelcome(new Date(), 4)).toBe(2);
    await query("DELETE FROM comments WHERE post_id = $1", [post!.id]);
  });

  it("calls a fan of the same team on a test result post", async () => {
    const [cat] = await query<{ id: number }>("INSERT INTO categories (slug, name, description) VALUES ('kl', 'K리그', '') RETURNING id");
    const [post] = await query<{ id: string }>("INSERT INTO posts (id, category_id, nickname, pw_hash, title, body, post_type) VALUES (3121, $1, 'n', 'x', 't', 'b', 'chat') RETURNING id::text", [cat!.id]);
    const add = (nick: string, fp: string, body: string, ago: string) =>
      query<{ id: string }>(
        `INSERT INTO comments (post_id, nickname, pw_hash, body, author_fingerprint, created_at) VALUES ($1, $2, 'x', $3, $4, now() - $5::interval) RETURNING id::text`,
        [post!.id, nick, body, fp, ago],
      );
    await add("수원삼성", "k1", "⚽ 축구 팬 테스트: 🚌 원정 직관러 / 응원 팀: 수원삼성블루윙즈", "2 days");
    const [b] = await add("빈이", "k2", "⚽ 축구 팬 테스트: 🚌 원정 직관러 / 응원 팀: 수원삼성/타지살이", "5 minutes");
    expect(await runWelcome(new Date(), 1)).toBe(1);
    const [r] = await query<{ body: string }>("SELECT body FROM comments WHERE parent_id = $1", [b!.id]);
    expect(r!.body).toContain("@수원삼성님");
    expect(r!.body).toContain("수원삼성");
  });
});
