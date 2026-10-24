import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

type ToolsList = { result: { tools: { name: string; annotations: Record<string, boolean> }[] } };
type CallResult = { result: { content: { text: string }[]; structuredContent: Record<string, unknown>; isError?: boolean } };

d("MCP read-only tools + PlayMCP mode (10/24)", async () => {
  process.env.DATABASE_URL = url;
  process.env.SITE_URL = "https://nobangjang.com";
  const { pool, query } = await import("@/lib/db");
  const { handleRpc } = await import("@/lib/mcp");
  const { TESTS } = await import("@/lib/mcpRead");
  const call = (method: string, params?: Record<string, unknown>, readOnly = false) => handleRpc({ jsonrpc: "2.0", id: 1, method, params }, "fp", { readOnly });
  const tool = async (name: string, args: Record<string, unknown> = {}, readOnly = true) =>
    ((await call("tools/call", { name, arguments: args }, readOnly)) as CallResult).result;

  const ins = (cat: number, title: string, body: string, opts: { suppressed?: boolean; blinded?: boolean; type?: string } = {}) =>
    query("INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type, is_suppressed, is_blinded) VALUES ($1, '비밀닉네임', 'x', $2, $3, $4::post_type, $5, $6)", [
      cat,
      title,
      body,
      opts.type ?? "info",
      opts.suppressed ?? false,
      opts.blinded ?? false,
    ]);

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
    const [run] = await query<{ id: number }>("INSERT INTO categories (slug, name, description) VALUES ('러닝-덕후방', '러닝 덕후방', E'마라톤 대회 일정과 러닝화 이야기\\n둘째 줄') RETURNING id");
    const [hidden] = await query<{ id: number }>("INSERT INTO categories (slug, name, description, is_hidden) VALUES ('비밀방', '러닝 비밀 숨김방', '숨긴 방', true) RETURNING id");
    await ins(run!.id, "[행사] 춘천마라톤 접수 시작", "춘천마라톤 접수가 11월 1일 시작해요. " + "가".repeat(300));
    await ins(run!.id, "[혜택] 러닝화 30% 할인", "공식몰 할인 쿠폰");
    await ins(run!.id, "[행사] 광고 의심 행사", "광고", { suppressed: true });
    await ins(run!.id, "[행사] 블라인드 행사", "블라인드", { blinded: true });
    await ins(hidden!.id, "[행사] 숨긴 방 행사", "숨김");
    await ins(run!.id, "러닝화 쿠션 비교 정리", "러닝화 쿠션 비교: 쿠션이 좋은 러닝화를 정리했어요.");
    await ins(run!.id, "러닝화 광고글", "러닝화 쿠션 최고 러닝화", { suppressed: true });
    await ins(run!.id, "러닝화 잡담", "러닝화 쿠션 잡담", { type: "chat" });
  });
  afterAll(async () => {
    await pool().end();
  });

  it("lists every tool by default and only read-only tools in PlayMCP mode", async () => {
    const all = ((await call("tools/list")) as ToolsList).result.tools.map((t) => t.name);
    expect(all).toEqual(["today_debate", "join_debate", "post_opinion", "listening_test_stats", "list_rooms", "search_events", "search_posts", "list_tests"]);
    const ro = ((await call("tools/list", {}, true)) as ToolsList).result.tools;
    expect(ro.map((t) => t.name)).toEqual(["today_debate", "listening_test_stats", "list_rooms", "search_events", "search_posts", "list_tests"]);
    for (const t of ro) expect(t.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
    const init = (await call("initialize", { protocolVersion: "2025-06-18" }, true)) as { result: { instructions: string; protocolVersion: string } };
    expect(init.result.protocolVersion).toBe("2025-06-18");
    expect(init.result.instructions).not.toContain("join_debate");
  });

  it("refuses write tools in PlayMCP mode", async () => {
    for (const name of ["join_debate", "post_opinion"]) {
      expect(await call("tools/call", { name, arguments: { name: "bot", api_key: "x", body: "[A] 이유" } }, true)).toMatchObject({ error: { code: -32602 } });
    }
    const n = await query<{ n: number }>("SELECT count(*)::int AS n FROM agents");
    expect(n[0]!.n).toBe(0);
  });

  it("list_rooms: visible rooms with url and one-line description", async () => {
    const r = await tool("list_rooms", { query: "러닝" });
    const rooms = r.structuredContent.rooms as { name: string; description: string; post_count: number; url: string }[];
    expect(rooms).toHaveLength(1);
    expect(rooms[0]).toMatchObject({ name: "러닝 덕후방", description: "마라톤 대회 일정과 러닝화 이야기 둘째 줄", url: `https://nobangjang.com/c/${encodeURIComponent("러닝-덕후방")}?from=playmcp` });
    expect(typeof rooms[0]!.post_count).toBe("number");
    expect(JSON.parse(r.content[0]!.text)).toEqual(r.structuredContent);
    const all = (await tool("list_rooms", { limit: 99 })).structuredContent.rooms as { name: string }[];
    expect(all.length).toBeLessThanOrEqual(20);
    expect(all.map((x) => x.name)).not.toContain("러닝 비밀 숨김방");
  });

  it("search_events: [행사]·[혜택] posts, no suppressed/blinded/hidden, no nicknames", async () => {
    const r = await tool("search_events", { room: "러닝 덕후방" });
    const ev = r.structuredContent.events as { title: string; room: string; created_at: string; excerpt: string; url: string }[];
    expect(ev.map((e) => e.title).sort()).toEqual(["[행사] 춘천마라톤 접수 시작", "[혜택] 러닝화 30% 할인"]);
    for (const e of ev) {
      expect(Object.keys(e).sort()).toEqual(["created_at", "excerpt", "room", "title", "url"]);
      expect([...e.excerpt].length).toBeLessThanOrEqual(200);
      expect(e.url).toMatch(/^https:\/\/nobangjang\.com\/posts\/\d+\?from=playmcp$/);
    }
    expect(r.content[0]!.text).not.toContain("비밀닉네임");
    const kw = (await tool("search_events", { keyword: "할인", upcoming_only: true })).structuredContent.events as { title: string }[];
    expect(kw.map((e) => e.title)).toEqual(["[혜택] 러닝화 30% 할인"]);
    const all = (await tool("search_events")).structuredContent.events as { title: string }[];
    expect(all.map((e) => e.title)).not.toContain("[행사] 숨긴 방 행사");
    expect((await tool("search_events", { room: "없는방이름" })).structuredContent.note).toContain("찾지 못했어요");
  });

  it("search_posts: info posts via site search, no suppressed or chat", async () => {
    const r = await tool("search_posts", { query: "러닝화 쿠션", room: "러닝-덕후방" });
    const posts = r.structuredContent.posts as { title: string; room: string; excerpt: string; url: string }[];
    expect(posts.map((p) => p.title)).toEqual(["러닝화 쿠션 비교 정리"]);
    expect(Object.keys(posts[0]!).sort()).toEqual(["excerpt", "room", "title", "url"]);
    expect(posts[0]!.url).toMatch(/\?from=playmcp$/);
    // [행사] 글은 제목에 검색어가 있을 때만
    expect((await tool("search_posts", { query: "11월" })).structuredContent.posts).toEqual([]);
    expect(((await tool("search_posts", { query: "춘천마라톤" })).structuredContent.posts as { title: string }[]).map((p) => p.title)).toEqual(["[행사] 춘천마라톤 접수 시작"]);
  });

  it("list_tests: tests with urls and related room", async () => {
    const tests = (await tool("list_tests")).structuredContent.tests as { name: string; description: string; url: string; room_url: string | null }[];
    expect(tests.length).toBe(Math.min(20, TESTS.length));
    expect(tests[0]).toMatchObject({ name: "황금귀 테스트", url: "https://nobangjang.com/ear-test?from=playmcp" });
    const run = (await tool("list_tests", { query: "러너" })).structuredContent.tests as { room_url: string | null }[];
    expect(run[0]!.room_url).toBe(`https://nobangjang.com/c/${encodeURIComponent("러닝-덕후방")}?from=playmcp`);
    const pages = readdirSync(path.join(process.cwd(), "src", "app"));
    for (const t of TESTS) expect(pages).toContain(t.path.slice(1));
    for (const p of pages.filter((p) => p.endsWith("-test"))) expect(TESTS.map((t) => t.path)).toContain(`/${p}`);
  });
});
