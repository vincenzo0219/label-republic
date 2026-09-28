import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp, { type Sharp } from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { processImage } from "@/lib/images/process";
import { assertKey, LocalStorage } from "@/lib/images/storage";

const jpeg = (w: number, h: number, extra?: (s: Sharp) => Sharp) => {
  const base = sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 120, b: 40 } } });
  return (extra ? extra(base) : base).jpeg().toBuffer();
};

describe("image processing", () => {
  it("applies EXIF orientation, strips metadata and resizes to WebP + thumbnail", async () => {
    // 휴대폰 세로 사진: 픽셀은 가로(3000x2000)로 저장되고 Orientation=6(90° 회전) + 기기·작성자 정보
    const input = await jpeg(3000, 2000, (s) =>
      s.withMetadata({ orientation: 6 }).withExif({ IFD0: { Make: "PhoneCo", Model: "X1", Artist: "홍길동", Copyright: "secret" } }),
    );
    const inMeta = await sharp(input).metadata();
    expect(inMeta.exif).toBeDefined();
    expect(inMeta.orientation).toBe(6);

    const out = await processImage(input);
    expect({ w: out.width, h: out.height }).toEqual({ w: 1067, h: 1600 }); // 회전 반영 후 긴 변 1600
    expect(Math.max(out.thumbWidth, out.thumbHeight)).toBe(480);
    for (const buf of [out.full, out.thumb]) {
      const m = await sharp(buf).metadata();
      expect(m.format).toBe("webp");
      expect(m.exif).toBeUndefined();
      expect(m.xmp).toBeUndefined();
      expect(m.orientation).toBeUndefined();
    }
    expect(out.full.includes(Buffer.from("PhoneCo"))).toBe(false);
    expect(out.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not upscale small images", async () => {
    const out = await processImage(await jpeg(300, 200));
    expect({ w: out.width, h: out.height, tw: out.thumbWidth }).toEqual({ w: 300, h: 200, tw: 300 });
  });

  it("rejects non-images, SVG, empty and oversized input", async () => {
    await expect(processImage(Buffer.from("<html>not an image</html>"))).rejects.toMatchObject({ status: 415 });
    await expect(processImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>'))).rejects.toMatchObject({ status: 415 });
    await expect(processImage(Buffer.alloc(0))).rejects.toMatchObject({ status: 415 });
    await expect(processImage(Buffer.alloc(11 * 1024 * 1024))).rejects.toMatchObject({ status: 413 });
    // 잘린 JPEG
    const cut = (await jpeg(400, 300)).subarray(0, 300);
    await expect(processImage(cut)).rejects.toMatchObject({ status: 415 });
  });

  it("rejects decompression bombs by pixel count", async () => {
    // 단색 8000x6000 PNG 는 수백 KB 지만 4,800만 화소
    const bomb = await sharp({ create: { width: 8000, height: 6000, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png({ compressionLevel: 9 }).toBuffer();
    expect(bomb.length).toBeLessThan(2 * 1024 * 1024);
    await expect(processImage(bomb)).rejects.toMatchObject({ status: 413 });
  });
});

describe("local image storage", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "lr-img-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const id = "0f8fad5b-d9cb-469f-a165-70867728950e";

  it("stores, reads and deletes by strict keys only", async () => {
    const s = new LocalStorage(dir);
    await s.put(`img/${id}.webp`, Buffer.from("x"), "image/webp");
    expect((await s.get(`img/${id}.webp`))?.toString()).toBe("x");
    expect(readdirSync(path.join(dir, "img"))).toEqual([`${id}.webp`]); // 임시 파일이 남지 않는다
    await s.delete(`img/${id}.webp`);
    expect(await s.get(`img/${id}.webp`)).toBeNull();
    await s.delete(`img/${id}.webp`); // 없어도 오류 아님
    for (const bad of ["../etc/passwd", `img/../../${id}.webp`, `img/${id}.png`, "img/abc.webp"]) {
      expect(() => assertKey(bad)).toThrow();
    }
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("post images (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const posts = await import("@/lib/repo/posts");
  const images = await import("@/lib/repo/images");
  const storage = await import("@/lib/images/storage");
  const dir = mkdtempSync(path.join(tmpdir(), "lr-img-db-"));
  const files = () => (existsSync(path.join(dir, "img")) ? readdirSync(path.join(dir, "img")).sort() : []);

  const newPost = (imgs?: { id: string; token?: string; alt?: string }[], title = "성분표 사진 첨부 글") =>
    posts.createPost({
      categorySlug: "supplements",
      nickname: "테스터",
      pin: "1234",
      title,
      body: "마그네슘 200mg 제품 성분표 사진입니다.",
      summary: { lines: ["하나", "둘", "셋"], model: "author", isAuthorEdited: true },
      images: imgs,
    });
  const upload = async () => images.saveUpload(await jpeg(800, 600), "f".repeat(64));

  beforeAll(async () => {
    storage.setImageStorage(new storage.LocalStorage(dir));
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const mdir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(mdir).filter((f) => f.endsWith(".sql")).sort()) {
      await query(readFileSync(path.join(mdir, f), "utf8"));
    }
  });

  beforeEach(async () => {
    await resetRateLimits();
    await query("TRUNCATE posts, post_images RESTART IDENTITY CASCADE");
    rmSync(path.join(dir, "img"), { recursive: true, force: true });
  });

  afterAll(async () => {
    storage.setImageStorage(undefined);
    rmSync(dir, { recursive: true, force: true });
    await pool().end();
  });

  it("uploads, attaches in order with alt text, and shows a card thumbnail", async () => {
    const a = await upload();
    const b = await upload();
    expect(files()).toEqual([`${a.id}.webp`, `${a.id}_t.webp`, `${b.id}.webp`, `${b.id}_t.webp`].sort());
    // 첨부 전에는 내려주지 않는다
    expect(await images.readServableImage(a.id, "full")).toBeNull();

    const post = await newPost([
      { id: b.id, token: b.token, alt: "뒷면 성분표" },
      { id: a.id, token: a.token, alt: "  앞면  " },
    ]);
    expect(post.images.map((i) => [i.id, i.alt])).toEqual([
      [b.id, "뒷면 성분표"],
      [a.id, "앞면"],
    ]);
    expect(post.images[0]).toMatchObject({ width: 800, height: 600 });
    expect((await images.readServableImage(b.id, "thumb"))?.length).toBeGreaterThan(0);
    const card = (await posts.listPosts({ sort: "latest" })).items[0]!;
    expect(card).toMatchObject({ thumb_id: b.id, image_count: 2 });
  });

  it("requires the upload token and never lets another post take an image", async () => {
    const a = await upload();
    await expect(newPost([{ id: a.id }])).rejects.toMatchObject({ code: "image_forbidden" });
    await expect(newPost([{ id: a.id, token: "x".repeat(32) }])).rejects.toMatchObject({ code: "image_forbidden" });
    const first = await newPost([{ id: a.id, token: a.token }]);
    // 토큰을 알아도 이미 다른 글에 붙은 이미지는 가져올 수 없다
    await expect(newPost([{ id: a.id, token: a.token }])).rejects.toMatchObject({ code: "image_forbidden" });
    await expect(newPost([{ id: "0f8fad5b-d9cb-469f-a165-70867728950e", token: a.token }])).rejects.toMatchObject({ code: "image_expired" });
    const many = await Promise.all(Array.from({ length: 7 }, upload));
    await expect(newPost(many.map((m) => ({ id: m.id, token: m.token })))).rejects.toMatchObject({ code: "too_many_images" });
    await expect(newPost([{ id: a.id, token: a.token }, { id: a.id, token: a.token }])).rejects.toMatchObject({ code: "invalid_image" });
    // 실패한 글쓰기는 롤백되어 첫 글의 이미지는 그대로
    expect((await posts.getPost(first.id))!.images.map((i) => i.id)).toEqual([a.id]);
  });

  it("replaces images on edit and deletes removed files", async () => {
    const a = await upload();
    const b = await upload();
    const post = await newPost([{ id: a.id, token: a.token }, { id: b.id, token: b.token }]);
    const c = await upload();
    // 기존 이미지는 토큰 없이 유지, 순서·설명 변경, b 제거, c 추가
    const edited = await posts.updatePost(post.id, "f".repeat(64), "1234", {
      images: [{ id: c.id, token: c.token, alt: "새 사진" }, { id: a.id, alt: "앞면" }],
    });
    expect(edited.images.map((i) => [i.id, i.alt])).toEqual([
      [c.id, "새 사진"],
      [a.id, "앞면"],
    ]);
    expect(files().some((f) => f.startsWith(b.id))).toBe(false);
    expect((await query("SELECT count(*)::int AS n FROM post_images"))[0]).toEqual({ n: 2 });
    // images 를 보내지 않은 수정은 이미지를 건드리지 않는다
    expect((await posts.updatePost(post.id, "f".repeat(64), "1234", { title: "제목만 수정" })).images).toHaveLength(2);
  });

  it("stops serving images of blinded posts and removes files with the post", async () => {
    const a = await upload();
    const post = await newPost([{ id: a.id, token: a.token }]);
    await query("UPDATE posts SET is_blinded = true WHERE id = $1", [post.id]);
    expect(await images.readServableImage(a.id, "full")).toBeNull();
    const blinded = (await posts.getPost(post.id))!;
    expect(blinded).toMatchObject({ images: [], thumb_id: null, image_count: 0 });
    await query("UPDATE posts SET is_blinded = false WHERE id = $1", [post.id]);
    await posts.deletePost(post.id, "f".repeat(64), "1234");
    expect(files()).toEqual([]);
    expect(await images.readServableImage(a.id, "full")).toBeNull();
  });

  it("sweeps unattached uploads after 24 hours", async () => {
    const orphan = await upload();
    const kept = await upload();
    await newPost([{ id: kept.id, token: kept.token }]);
    expect(await images.sweepOrphanImages()).toBe(0);
    expect(await images.sweepOrphanImages(new Date(Date.now() + 25 * 3600_000))).toBe(1);
    expect(files()).toEqual([`${kept.id}.webp`, `${kept.id}_t.webp`].sort());
    expect(orphan.id).not.toBe(kept.id);
  });
});
