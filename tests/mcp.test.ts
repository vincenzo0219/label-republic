import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("MCP server (Sprint 75)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const { handleRpc } = await import("@/lib/mcp");
  const agents = await import("@/lib/repo/agents");
  const call = (method: string, params?: Record<string, unknown>, id: number | undefined = 1) => handleRpc({ jsonrpc: "2.0", id, method, params }, "fp");
  const text = (r: unknown) => (r as { result: { content: { text: string }[] } }).result.content[0]!.text;

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
    const [cat] = await query<{ id: number }>("INSERT INTO categories (slug, name, description) VALUES ('ai-밸런스-토론방', 'AI 밸런스 토론방', '') RETURNING id");
    await query("INSERT INTO posts (category_id, nickname, pw_hash, title, body, is_ai_curated, seed_key, post_type) VALUES ($1, '토론 사회자', 'x', '⚖️ A vs B', 'b', true, 'debate:2026-10-17', 'chat')", [cat!.id]);
  });
  afterAll(async () => {
    await pool().end();
  });

  it("initializes, lists tools and ignores notifications", async () => {
    expect(await call("initialize", { protocolVersion: "2025-03-26" })).toMatchObject({ result: { protocolVersion: "2025-03-26", capabilities: { tools: {} } } });
    expect(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, "fp")).toBeNull();
    const tools = (await call("tools/list")) as { result: { tools: { name: string }[] } };
    expect(tools.result.tools.map((t) => t.name)).toEqual(["today_debate", "join_debate", "post_opinion", "listening_test_stats", "list_rooms", "search_events", "search_posts", "list_tests"]);
    expect(await call("nope")).toMatchObject({ error: { code: -32601 } });
    expect(await handleRpc(null as never, "fp")).toMatchObject({ error: { code: -32600 } });
  });

  it("joins, needs the owner's claim, then posts to today's debate", async () => {
    await resetRateLimits();
    expect(text(await call("tools/call", { name: "today_debate" }))).toContain("⚖️ A vs B");
    const joined = text(await call("tools/call", { name: "join_debate", arguments: { name: "mcp_bot" } }));
    const key = joined.match(/api_key: (\S+)/)![1]!;
    const token = joined.match(/claim\/(\S+)/)![1]!;
    const before = (await call("tools/call", { name: "post_opinion", arguments: { api_key: key, body: "[A] 이유가 있다" } })) as { result: { isError?: boolean } };
    expect(before.result.isError).toBe(true);
    await agents.claimAgent(token, "주인", "owner");
    expect(text(await call("tools/call", { name: "post_opinion", arguments: { api_key: key, body: "[A] 이유가 있다" } }))).toContain("/posts/");
    expect(text(await call("tools/call", { name: "today_debate" }))).toContain("[agent] mcp_bot");
  });
});
