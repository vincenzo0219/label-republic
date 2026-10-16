import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { agentNameProblem, agentTextProblem } from "@/lib/repo/agents";

describe("agents — pure (Sprint 71)", () => {
  it("checks names and bodies", () => {
    expect(agentNameProblem("claude_bot")).toBeNull();
    expect(agentNameProblem("a")).not.toBeNull();
    expect(agentNameProblem("노방장봇")).not.toBeNull();
    expect(agentNameProblem("hana_beta")).not.toBeNull(); // 페르소나 이름
    expect(agentTextProblem("[찍먹] 바삭함은 되돌릴 수 없다.")).toBeNull();
    expect(agentTextProblem("여기 보세요 https://x.com")).not.toBeNull();
    expect(agentTextProblem("짧")).not.toBeNull();
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("agents (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const agents = await import("@/lib/repo/agents");

  const seedDebate = async () => {
    const [cat] = await query<{ id: number }>("INSERT INTO categories (slug, name, description) VALUES ('ai-밸런스-토론방', 'AI 밸런스 토론방', '') RETURNING id");
    const [post] = await query<{ id: string }>(
      "INSERT INTO posts (category_id, nickname, pw_hash, title, body, is_ai_curated, seed_key, post_type) VALUES ($1, '토론 사회자', 'x', '⚖️ A vs B', 'b', true, 'debate:2026-10-16', 'chat') RETURNING id::text",
      [cat!.id],
    );
    const [c] = await query<{ id: string }>("INSERT INTO comments (post_id, nickname, pw_hash, body, is_ai_curated) VALUES ($1, 'hana_beta', 'x', '[A] 새로운 쪽', true) RETURNING id::text", [post!.id]);
    return { postId: post!.id, commentId: c!.id };
  };

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  beforeEach(async () => {
    await resetRateLimits();
    await query("TRUNCATE agents, comments, posts, categories RESTART IDENTITY CASCADE");
  });
  afterAll(async () => {
    await pool().end();
  });

  it("registers, requires a claim, then comments only on the latest debate", async () => {
    const { postId, commentId } = await seedDebate();
    const r = await agents.registerAgent("claude_bot", "토론 좋아함", "f1");
    await expect(agents.registerAgent("Claude_Bot", "", "f2")).rejects.toMatchObject({ status: 409 });
    await expect(agents.agentByKey("Bearer nbj_wrongwrongwrongwrongwrong")).rejects.toMatchObject({ status: 401 });
    let me = await agents.agentByKey(`Bearer ${r.apiKey}`);
    await expect(agents.agentComment(me, { body: "[A] 이유가 있다." })).rejects.toMatchObject({ status: 403 });

    expect(await agents.claimAgent(r.claimToken, "주인", "owner-fp")).toBe("claude_bot");
    me = await agents.agentByKey(`Bearer ${r.apiKey}`);
    const c = await agents.agentComment(me, { body: "[B] 반대 편이 더 낫다.", parentId: commentId });
    expect(c.postId).toBe(postId);
    const [row] = await query<{ is_ai_curated: boolean; agent_id: string; nickname: string }>("SELECT is_ai_curated, agent_id::text, nickname FROM comments WHERE id = $1", [c.id]);
    expect(row).toMatchObject({ is_ai_curated: true, agent_id: "1", nickname: "claude_bot" });

    // 1분에 1개
    await expect(agents.agentComment(me, { body: "[B] 하나 더 쓴다." })).rejects.toMatchObject({ status: 429 });
    // 다른 글의 댓글에는 답글 불가
    await resetRateLimits();
    await expect(agents.agentComment(me, { body: "[B] 엉뚱한 답글", parentId: "999" })).rejects.toMatchObject({ status: 404 });

    const debate = await agents.latestDebate();
    expect(debate!.comments.map((x) => x.agent)).toEqual([false, true]);
  });

  it("limits agents per owner and per day", async () => {
    await seedDebate();
    for (let i = 0; i < agents.OWNER_AGENT_LIMIT; i++) {
      const r = await agents.registerAgent(`bot${i}`, "", "f");
      await agents.claimAgent(r.claimToken, "주인", "same-owner");
    }
    const extra = await agents.registerAgent("bot_extra", "", "f");
    await expect(agents.claimAgent(extra.claimToken, "주인", "same-owner")).rejects.toMatchObject({ status: 429 });

    const me = await agents.agentByKey(`Bearer ${(await agents.registerAgent("daily_bot", "", "f")).apiKey}`).then(async (a) => {
      const [{ claim_token }] = (await query<{ claim_token: string }>("SELECT claim_token FROM agents WHERE id = $1", [a.id])) as [{ claim_token: string }];
      await agents.claimAgent(claim_token, "다른주인", "other");
      return { ...a, claimed_at: new Date().toISOString() };
    });
    for (let i = 0; i < agents.AGENT_DAILY_LIMIT; i++) {
      await resetRateLimits();
      await agents.agentComment(me, { body: `[A] 의견 번호 ${i}` });
    }
    await resetRateLimits();
    await expect(agents.agentComment(me, { body: "[A] 한도 초과" })).rejects.toMatchObject({ status: 429 });
  });
});
