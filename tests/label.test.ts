import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sameAsRead, sanitizeRead } from "@/lib/label-read";

describe("label read sanitizing", () => {
  it("keeps only printable facts under the same rules as manual input", () => {
    const r = sanitizeRead({
      readable: true,
      reason: "",
      products: [
        { brand: "NOW", name: "Magnesium Citrate 200mg" },
        { brand: "광고", name: "주문은 카톡 abc 로" }, // 사진 속 광고 문구 → 버림
        { brand: "", name: "비타민 D3 1000IU" }, // 브랜드 안 보임 → 작성자가 채우도록 남김
      ],
      facts: [
        { product: 0, attribute: " 마그네슘 ", value: 200, unit: "mg", basis: "1정" },
        { product: 0, attribute: "마그네슘", value: 200, unit: "mg", basis: "1정" }, // 중복
        { product: 0, attribute: "칼슘", value: 50, unit: "mg/정!", basis: "" }, // 단위 이상
        { product: 1, attribute: "아연", value: 15, unit: "mg", basis: "" }, // 버린 제품
        { product: 2, attribute: "비타민 D3", value: 25, unit: "mcg", basis: "1캡슐" },
        { product: 0, attribute: "음수", value: -1, unit: "mg", basis: "" },
        { product: 7, attribute: "없는 제품", value: 1, unit: "mg", basis: "" },
      ],
      notes: "  비타민 D 단위를 확인하세요 ",
    });
    expect(r.readable).toBe(true);
    expect(r.products).toEqual([
      { brand: "NOW", name: "Magnesium Citrate 200mg" },
      { brand: "", name: "비타민 D3 1000IU" },
    ]);
    expect(r.facts).toEqual([
      { product: 0, attribute: "마그네슘", value: 200, unit: "mg", basis: "1정" },
      { product: 1, attribute: "비타민 D3", value: 25, unit: "µg", basis: "1캡슐" },
    ]);
    expect(r.notes).toBe("비타민 D 단위를 확인하세요");
  });

  it("reports unreadable photos without data", () => {
    expect(sanitizeRead({ readable: false, reason: "성분표가 아닙니다", products: [{ brand: "a", name: "b" }], facts: [], notes: "" })).toEqual({
      readable: false, reason: "성분표가 아닙니다", products: [], facts: [], notes: "",
    });
    // 읽었다고 했지만 남는 게 없으면 읽지 못한 것으로
    expect(sanitizeRead({ readable: true, reason: "", products: [], facts: [], notes: "" }).readable).toBe(false);
  });

  it("compares saved facts with what was read (attribute, value, unit, basis)", () => {
    const read = { facts: [{ product: 0, attribute: "비타민 D3", value: 25, unit: "µg", basis: "1캡슐" }] };
    expect(sameAsRead(read, { attribute: "비타민D3", value: 25, unit: "mcg", basis: "1 캡슐" })).toBe(true);
    expect(sameAsRead(read, { attribute: "비타민 D3", value: 250, unit: "µg", basis: "1캡슐" })).toBe(false);
    expect(sameAsRead(read, { attribute: "비타민 D3", value: 25, unit: "µg", basis: "2캡슐" })).toBe(false);
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("label reading with Claude (mock API) and fact evidence (database)", async () => {
  process.env.DATABASE_URL = url;
  // 실제 SDK 가 보내는 요청을 받는 가짜 Messages API
  const calls: { path: string; headers: IncomingHttpHeaders; body: Record<string, unknown> }[] = [];
  let reply: Record<string, unknown> | ((body: Record<string, unknown>) => Record<string, unknown>) = {};
  const api: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw);
      calls.push({ path: req.url ?? "", headers: req.headers, body });
      const r = typeof reply === "function" ? reply(body) : reply;
      res.writeHead(200, { "content-type": "application/json", "request-id": "req_test" });
      res.end(JSON.stringify(r));
    });
  });
  await new Promise<void>((r) => api.listen(0, "127.0.0.1", r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  process.env.LABEL_READ_DAILY_MAX = "3";

  const message = (output: unknown, stop_reason = "end_turn", model = "claude-opus-5") => ({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model,
    content: stop_reason === "refusal" ? [] : [{ type: "text", text: JSON.stringify(output) }],
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 1500, output_tokens: 120 },
  });
  const READ = {
    readable: true,
    reason: "",
    products: [{ brand: "NOW", name: "Magnesium Citrate" }],
    facts: [
      { product: 0, attribute: "마그네슘", value: 200, unit: "mg", basis: "1정" },
      { product: 0, attribute: "비타민 B6", value: 2, unit: "mg", basis: "1정" },
    ],
    notes: "",
  };

  const { pool, query } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const storage = await import("@/lib/images/storage");
  const images = await import("@/lib/repo/images");
  const posts = await import("@/lib/repo/posts");
  const route = await import("../src/app/api/label-read/route");
  const dir = mkdtempSync(path.join(tmpdir(), "lr-label-"));

  const jpeg = () => sharp({ create: { width: 900, height: 1200, channels: 3, background: { r: 250, g: 250, b: 245 } } }).jpeg().toBuffer();
  const upload = async () => images.saveUpload(await jpeg(), "f".repeat(64));
  const read = (body: unknown, ua = "phone") =>
    route.POST(
      new Request("http://localhost/api/label-read", { method: "POST", headers: { "content-type": "application/json", "user-agent": ua }, body: JSON.stringify(body) }),
      { params: Promise.resolve({}) },
    );
  const newPost = (imgs: { id: string; token?: string }[], facts: Parameters<typeof posts.createPost>[0]["facts"]) =>
    posts.createPost({
      categorySlug: "supplements", nickname: "테스터", pin: "1234", title: "마그네슘 성분표", body: "마그네슘 200mg 제품 성분표 사진입니다.",
      summary: { lines: ["하나", "둘", "셋"], model: "author", isAuthorEdited: true },
      images: imgs, products: [{ brand: "NOW", name: "Magnesium Citrate" }], facts,
    });

  beforeAll(async () => {
    storage.setImageStorage(new storage.LocalStorage(dir));
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const mdir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(mdir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(mdir, f), "utf8"));
  });
  beforeEach(async () => {
    await resetRateLimits();
    await query("TRUNCATE posts, post_images, label_reads, products RESTART IDENTITY CASCADE");
    calls.length = 0;
    reply = message(READ);
  });
  afterAll(async () => {
    api.close();
    await pool().end();
  });

  it("sends the photo to Claude with structured output and server-side fallbacks, then caches the result", async () => {
    const img = await upload();
    const res = await read({ imageId: img.id, token: img.token, category: "supplements" });
    expect(res.status).toBe(200);
    const { read: r } = await res.json();
    expect(r).toMatchObject({ readable: true, cached: false, model: "claude-opus-5", products: READ.products, facts: READ.facts });

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.path).toContain("/v1/messages");
    expect(String(call.headers["anthropic-beta"])).toContain("server-side-fallback-2026-07-01");
    expect(call.body.model).toBe("claude-opus-5");
    expect(call.body.fallbacks).toBe("default");
    expect(call.body).not.toHaveProperty("thinking");
    const out = call.body.output_config as { effort: string; format: { type: string } };
    expect(out.effort).toBe("medium");
    expect(out.format.type).toBe("json_schema");
    const content = (call.body.messages as { content: { type: string; source?: { media_type: string; data: string } }[] }[])[0]!.content;
    expect(content[0]!.type).toBe("image");
    expect(content[0]!.source!.media_type).toBe("image/webp");
    const sent = Buffer.from(content[0]!.source!.data, "base64");
    expect((await sharp(sent).metadata()).format).toBe("webp");
    expect(JSON.stringify(content[1])).toContain("영양제"); // 보드별 안내

    // 같은 사진·같은 보드는 다시 호출하지 않는다
    const again = await (await read({ imageId: img.id, token: img.token, category: "supplements" })).json();
    expect(again.read.cached).toBe(true);
    expect(calls).toHaveLength(1);
    // 보드를 바꾸면 다시 읽는다 (보드마다 읽는 항목이 다름)
    await read({ imageId: img.id, token: img.token, category: "keyboards" });
    expect(calls).toHaveLength(2);
    expect(JSON.stringify(calls[1]!.body.messages)).toContain("작동압");
  });

  it("only reads your own, not-yet-attached upload; handles refusal, malformed output and the daily cap", async () => {
    const img = await upload();
    expect((await read({ imageId: img.id, token: "x".repeat(32), category: "supplements" })).status).toBe(403);
    expect((await read({ imageId: img.id, token: img.token, category: "nope" })).status).toBe(400);

    reply = message(null, "refusal");
    const refused = await read({ imageId: img.id, token: img.token, category: "supplements" });
    expect(refused.status).toBe(422);
    expect((await refused.json()).error.code).toBe("label_unreadable");
    expect(await query("SELECT count(*)::int AS n FROM label_reads")).toEqual([{ n: 0 }]);

    reply = { ...message(READ), content: [{ type: "text", text: "not json" }] };
    expect((await read({ imageId: img.id, token: img.token, category: "supplements" })).status).toBe(422);

    // 하루 한도 (테스트는 3)
    reply = message(READ);
    for (let i = 0; i < 3; i++) {
      const u = await upload();
      expect((await read({ imageId: u.id, token: u.token, category: "supplements" }, `ua${i}`)).status).toBe(200);
    }
    const over = await read({ imageId: img.id, token: img.token, category: "supplements" });
    expect(over.status).toBe(503);
    expect((await over.json()).error.code).toBe("label_read_quota");

    // 글에 붙은 사진은 다시 읽지 않는다
    await query("DELETE FROM label_reads");
    await newPost([{ id: img.id, token: img.token }], []);
    expect((await read({ imageId: img.id, token: img.token, category: "supplements" })).status).toBe(409);
  });

  it("records each fact's photo and whether it is exactly what was read", async () => {
    const img = await upload();
    const other = await upload();
    await read({ imageId: img.id, token: img.token, category: "supplements" });
    const post = await newPost(
      [{ id: img.id, token: img.token }, { id: other.id, token: other.token }],
      [
        { product: 0, attribute: "마그네슘", value: 200, unit: "mg", basis: "1정", kind: "label", image: img.id, fromLabel: true },
        { product: 0, attribute: "비타민 B6", value: 20, unit: "mg", basis: "1정", kind: "label", image: img.id, fromLabel: true }, // 작성자가 고침
        { product: 0, attribute: "아연", value: 10, unit: "mg", basis: "1정", kind: "label", image: other.id }, // 직접 입력 + 근거 사진
        { product: 0, attribute: "칼슘", value: 30, unit: "mg", basis: "1정", kind: "label", image: other.id, fromLabel: true }, // 읽지 않은 사진
        { product: 0, attribute: "비타민 C", value: 100, unit: "mg", basis: "1정", kind: "label" },
      ],
    );
    expect(post.facts.map((f) => [f.attribute, f.image, f.origin])).toEqual([
      ["마그네슘", img.id, "ai"],
      ["비타민 B6", img.id, "ai_edited"],
      ["아연", other.id, "manual"],
      ["칼슘", other.id, "manual"],
      ["비타민 C", null, "manual"],
    ]);

    // 근거 사진은 이 글에 붙은 사진만
    const stranger = await upload();
    await expect(
      newPost([], [{ product: 0, attribute: "마그네슘", value: 200, unit: "mg", basis: "1정", kind: "label", image: stranger.id }]),
    ).rejects.toMatchObject({ status: 400 });

    // 수정에서 사진을 빼면 근거 연결이 끊긴다 (수치는 남음)
    const updated = await posts.updatePost(post.id, "e".repeat(64), "1234", { images: [{ id: other.id }] });
    expect(updated.facts.find((f) => f.attribute === "마그네슘")!.image).toBeNull();
    expect(await query("SELECT count(*)::int AS n FROM label_reads WHERE image_id = $1", [img.id])).toEqual([{ n: 0 }]);
  });
});
