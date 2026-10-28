import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { neoTextProblem } from "@/lib/repo/neo";

// 💳 넣어둬 (10/27): 살까 말까 익명 투표, AI 판결 없음
describe("넣어둬 글 규칙", () => {
  it("링크·연락처·욕설은 받지 않는다", () => {
    expect(neoTextProblem("무선 이어폰", "지금 거 멀쩡함")).toBeNull();
    expect(neoTextProblem("이어폰", "https://shop.example.com/x")).toMatch(/링크/);
    expect(neoTextProblem("이어폰", "010-1234-5678 연락")).toMatch(/연락처/);
    expect(neoTextProblem("이어폰", "카톡 주세요")).toMatch(/연락처/);
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("💳 넣어둬 (DB)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const neo = await import("@/lib/repo/neo");
  const route = await import("@/app/api/neo/route");
  const dir = path.join(process.cwd(), "db", "migrations");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
    await resetRateLimits();
  }, 120_000);
  afterAll(async () => {
    await pool().end();
  });

  it("올리고 투표하면 내 표 뒤에만 결과가 보이고, 글쓴이는 투표하지 않는다", async () => {
    const it0 = await neo.createNeo({ title: "무선 이어폰", price: 239000, reason: "지금 거 멀쩡함", owner: "own", fingerprint: "fp1" });
    expect(it0).toMatchObject({ owner: true, tally: { buy: 0, keep: 0 }, closed: false });
    expect((await neo.getNeo(it0.id, "v1"))!.tally).toBeNull();
    expect(await neo.voteNeo(it0.id, "v1", "keep")).toMatchObject({ mine: "keep", tally: { buy: 0, keep: 1 } });
    await neo.voteNeo(it0.id, "v2", "buy");
    // 마음 바꾸기
    expect(await neo.voteNeo(it0.id, "v2", "keep")).toMatchObject({ tally: { buy: 0, keep: 2 } });
    await expect(neo.voteNeo(it0.id, "own", "buy")).rejects.toMatchObject({ status: 403 });
    await expect(neo.setNeoOutcome(it0.id, "own", "bought")).rejects.toMatchObject({ status: 409 });
    // 투표 중 "안 살래요": 바로 마감하고 넣어둔 것으로
    const quit = await neo.createNeo({ title: "게임기", price: 400000, reason: "", alt: "중고로", owner: "own", fingerprint: "fp1" });
    expect(quit.alt).toBe("중고로");
    expect(await neo.setNeoOutcome(quit.id, "own", "kept")).toMatchObject({ outcome: "kept", closed: true });
    expect(await neo.neoSaved()).toEqual({ won: 400000, count: 1 });
    await query("DELETE FROM neo_items WHERE id = $1", [quit.id]);
  });

  it("내 글만 고치고(투표 중에만) 지운다", async () => {
    const x = await neo.createNeo({ title: "안마기", price: 134000, reason: "", owner: "own5", fingerprint: "fp5" });
    await expect(neo.updateNeo(x.id, "other", { title: "안마기", price: 1000, reason: "", alt: "" })).rejects.toMatchObject({ status: 404 });
    await expect(neo.updateNeo(x.id, "own5", { title: "x", price: 134100, reason: "", alt: "" })).rejects.toMatchObject({ status: 400 });
    expect(await neo.updateNeo(x.id, "own5", { title: "목 안마기", price: 134100, reason: "어깨가 아파서", alt: "중고로" })).toMatchObject({ title: "목 안마기", price: 134100, reason: "어깨가 아파서", alt: "중고로", owner: true });
    await query("UPDATE neo_items SET closes_at = now() - interval '1 minute' WHERE id = $1", [x.id]);
    await expect(neo.updateNeo(x.id, "own5", { title: "목 안마기", price: 1000, reason: "", alt: "" })).rejects.toMatchObject({ status: 409 });
    await expect(neo.deleteNeo(x.id, "other")).rejects.toMatchObject({ status: 404 });
    await neo.deleteNeo(x.id, "own5");
    expect(await neo.getNeo(x.id, "own5")).toBeNull();
  });

  it("넣어둬 글마다 숨은 댓글 글 하나 (본 사람 수·댓글), 지우면 함께 지운다", async () => {
    const { ensureNeoTalks } = await import("@/lib/repo/neoTalk");
    const x = await neo.createNeo({ title: "롱패딩", price: 199000, reason: "", owner: "own6", fingerprint: "fp6" });
    const t1 = (await ensureNeoTalks([x]))[x.id]!;
    expect(t1).toMatchObject({ comments: 0, views: 0 });
    // 두 번 불러도 하나
    expect((await ensureNeoTalks([x]))[x.id]!.postId).toBe(t1.postId);
    const [p] = await query<{ slug: string; hidden: boolean }>("SELECT c.slug, c.is_hidden AS hidden FROM posts p JOIN categories c ON c.id = p.category_id WHERE p.id = $1", [t1.postId]);
    expect(p).toEqual({ slug: "neo", hidden: true });
    await neo.deleteNeo(x.id, "own6");
    expect(await query("SELECT 1 FROM posts WHERE id = $1", [t1.postId])).toHaveLength(0);
  });

  it("24시간 뒤 마감, 넣어뒀어요를 고르면 지킨 돈에 쌓인다", async () => {
    const it1 = await neo.createNeo({ title: "패딩", price: 189000, reason: "", owner: "own2", fingerprint: "fp2" });
    await query("UPDATE neo_items SET closes_at = now() - interval '1 minute' WHERE id = $1", [it1.id]);
    const seen = await neo.getNeo(it1.id, "v9");
    expect(seen).toMatchObject({ closed: true, tally: { buy: 0, keep: 0 } });
    await expect(neo.voteNeo(it1.id, "v9", "buy")).rejects.toMatchObject({ status: 409 });
    await expect(neo.setNeoOutcome(it1.id, "someone", "kept")).rejects.toMatchObject({ status: 404 });
    expect(await neo.setNeoOutcome(it1.id, "own2", "kept")).toMatchObject({ outcome: "kept" });
    expect(await neo.neoSaved()).toEqual({ won: 189000, count: 1 });
    const list = await neo.listNeo("v9");
    expect(list.closed.map((x) => x.title)).toContain("패딩");
    expect(list.open.map((x) => x.title)).toContain("무선 이어폰");
  });

  it("신고 3번이면 가리고, 하루 5개까지", async () => {
    const it2 = await neo.createNeo({ title: "가릴 글", price: 5000, reason: "", owner: "own3", fingerprint: "fp3" });
    await neo.reportNeo(it2.id, "r1");
    await neo.reportNeo(it2.id, "r1");
    await neo.reportNeo(it2.id, "r2");
    expect(await neo.reportNeo(it2.id, "r3")).toEqual({ hidden: true });
    expect(await neo.getNeo(it2.id, "r1")).toBeNull();
    for (let i = 0; i < 4; i++) await neo.createNeo({ title: `물건 ${i}`, price: 1000, reason: "", owner: "own3", fingerprint: "fp3" });
    await expect(neo.createNeo({ title: "여섯 번째", price: 1000, reason: "", owner: "own3", fingerprint: "fp3" })).rejects.toMatchObject({ status: 429 });
  });

  it("사진만 있으면 이름 없이 올라가고, 사진은 넣어둬 글이 보일 때만 내준다", async () => {
    const { imageToken, readServableImage, sweepOrphanImages } = await import("@/lib/repo/images");
    const [img] = await query<{ id: string }>(
      "INSERT INTO post_images (width, height, bytes, thumb_width, thumb_height, sha256) VALUES (10, 10, 10, 10, 10, repeat('a', 64)) RETURNING id::text",
    );
    await expect(neo.createNeo({ title: "", price: 50000, reason: "", owner: "ph", fingerprint: "fph" })).rejects.toMatchObject({ status: 400 });
    await expect(neo.createNeo({ title: "", price: 50000, reason: "", owner: "ph", fingerprint: "fph", photo: { id: img!.id, token: "wrong-token-x" } })).rejects.toMatchObject({ code: "invalid_image" });
    const it3 = await neo.createNeo({ title: "", price: 50000, reason: "", owner: "ph", fingerprint: "fph", photo: { id: img!.id, token: imageToken(img!.id) } });
    expect(it3).toMatchObject({ title: "", photo_id: img!.id });
    // 같은 사진을 다른 글에 또 붙일 수 없다
    await expect(neo.createNeo({ title: "", price: 50000, reason: "", owner: "ph", fingerprint: "fph", photo: { id: img!.id, token: imageToken(img!.id) } })).rejects.toMatchObject({ code: "invalid_image" });
    const [row] = await query<{ ok: boolean }>("SELECT neo_id IS NOT NULL AS ok FROM post_images WHERE id = $1", [img!.id]);
    expect(row!.ok).toBe(true);
    // 고아 정리에서 지우지 않는다
    await query("UPDATE post_images SET created_at = now() - interval '3 days' WHERE id = $1", [img!.id]);
    await sweepOrphanImages();
    expect((await query("SELECT 1 FROM post_images WHERE id = $1", [img!.id])).length).toBe(1);
    // 가려지면 내주지 않는다 (파일 저장소는 비어 있어 null 이지만 쿼리 경로를 탄다)
    await query("UPDATE neo_items SET is_hidden = true WHERE id = $1", [it3.id]);
    expect(await readServableImage(img!.id, "thumb")).toBeNull();
  });

  it("API: 가격·이름 검사, 방문자 쿠키를 붙인다", async () => {
    const req = (body: unknown) =>
      new Request("http://localhost/api/neo", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.77" }, body: JSON.stringify(body) });
    const ctx = { params: Promise.resolve({}) };
    expect((await route.POST(req({ title: "키보드", price: 500 }), ctx)).status).toBe(400);
    const ok = await route.POST(req({ title: "키보드", price: 129000, reason: "축 바꾸고 싶음" }), ctx);
    expect(ok.status).toBe(201);
    expect(ok.headers.get("set-cookie")).toMatch(/lr_vid=/);
    const body = (await ok.json()) as { item: { owner: boolean; tally: unknown } };
    expect(body.item).toMatchObject({ owner: true, tally: { buy: 0, keep: 0 } });
  });
});
