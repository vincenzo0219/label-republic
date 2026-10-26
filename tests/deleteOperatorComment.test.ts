import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("운영 닉네임 댓글 지우기 (10/26)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { deleteOperatorComment } = await import("@/lib/repo/operator");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  }, 30_000);
  afterAll(async () => {
    await pool().end();
  });

  it("deletes a comment by an operator nickname but never a person's comment", async () => {
    await query("INSERT INTO categories (slug, name, description) VALUES ('r', '방', '')");
    const [post] = await query<{ id: string }>(
      "INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type) VALUES (1, 'a', 'x', '글', '본문입니다 열 글자', 'chat') RETURNING id::text",
    );
    const add = async (nickname: string) =>
      (await query<{ id: string }>("INSERT INTO comments (post_id, nickname, pw_hash, body) VALUES ($1, $2, 'x', '댓글') RETURNING id::text", [post!.id, nickname]))[0]!.id;
    const op = await add("돈키호테");
    const person = await add("깃ㄱ");
    expect(await deleteOperatorComment(person)).toEqual({ deleted: false });
    expect(await deleteOperatorComment(op)).toEqual({ deleted: true, nickname: "돈키호테" });
    const left = await query<{ nickname: string }>("SELECT nickname FROM comments ORDER BY id");
    expect(left.map((r) => r.nickname)).toEqual(["깃ㄱ"]);
  });
});
