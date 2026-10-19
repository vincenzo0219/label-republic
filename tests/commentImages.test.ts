import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("댓글 사진 (Sprint 90)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { createComment, listComments } = await import("@/lib/repo/comments");
  const { imageToken, listPostImages, readServableImage } = await import("@/lib/repo/images");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  }, 30_000);
  afterAll(async () => {
    await pool().end();
  });

  const newImage = async () =>
    (await query<{ id: string }>(
      "INSERT INTO post_images (width, height, bytes, thumb_width, thumb_height, sha256) VALUES (10, 10, 10, 10, 10, repeat('a', 64)) RETURNING id",
    ))[0]!.id;

  it("attaches one uploaded photo to a comment, keeps it out of the post gallery, and hides it with the comment", async () => {
    await query("INSERT INTO categories (slug, name, description) VALUES ('r', '방', '')");
    const [post] = await query<{ id: string }>(
      "INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type) VALUES (1, 'a', 'x', '자랑', '본문입니다 열 글자', 'chat') RETURNING id::text",
    );
    const img = await newImage();
    await expect(createComment(post!.id, { nickname: "민", pin: "1234", body: "📷", image: { id: img, token: "bad" } })).rejects.toThrow();
    const c = await createComment(post!.id, { nickname: "민", pin: "1234", body: "📷", image: { id: img, token: imageToken(img) } });
    expect(c.image_id).toBe(img);
    expect((await listComments(post!.id))[0]!.image_id).toBe(img);
    expect(await listPostImages(post!.id)).toEqual([]);
    // 같은 사진을 다른 댓글에 다시 붙일 수 없다
    await expect(createComment(post!.id, { nickname: "철", pin: "1234", body: "📷", image: { id: img, token: imageToken(img) } })).rejects.toThrow();
    const ok = await query<{ ok: boolean }>(
      `SELECT true AS ok FROM post_images i JOIN posts p ON p.id = i.post_id WHERE i.id = $1 AND NOT p.is_blinded
         AND (i.comment_id IS NULL OR EXISTS (SELECT 1 FROM comments c WHERE c.id = i.comment_id AND c.ai_hidden_at IS NULL))`,
      [img],
    );
    expect(ok).toHaveLength(1);
    await query("UPDATE comments SET ai_hidden_reason = 'image', ai_hidden_at = now() WHERE id = $1", [c.id]);
    expect((await listComments(post!.id))[0]!.image_id).toBeNull();
    expect(await readServableImage(img, "thumb")).toBeNull();
  });
});
