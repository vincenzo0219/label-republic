import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEBATE_ROOM_SLUG, DEBATE_TOPICS, PERSONAS, debateTopic, personaSystem } from "@/lib/debate";
import { debateTextProblem } from "@/lib/jobs/debate";

describe("AI balance debate — pure (Sprint 69)", () => {
  it("has ten personas with distinct nicknames, a slug, and rotating topics", () => {
    expect(PERSONAS).toHaveLength(10);
    expect(new Set(PERSONAS.map((p) => p.nickname)).size).toBe(10);
    expect(DEBATE_ROOM_SLUG).toBe("ai-밸런스-토론방");
    expect(debateTopic("2026-10-16")).toEqual(DEBATE_TOPICS[0]);
    expect(debateTopic("2026-10-17")).toEqual(DEBATE_TOPICS[1]);
    expect(debateTopic("2026-10-01")).toEqual(DEBATE_TOPICS[0]);
    expect(personaSystem(PERSONAS[0]!)).toContain("겪은 척하지 않습니다");
  });

  it("drops made-up experiences, links, abuse and overlong text", () => {
    expect(debateTextProblem("부먹이 소스가 고르게 배어서 낫죠.")).toBeNull();
    expect(debateTextProblem("제가 먹어 봤는데 부먹이 낫더라고요")).toBe("경험담");
    expect(debateTextProblem("www.example.com 참고")).toBe("링크·연락처");
    expect(debateTextProblem("가".repeat(300))).toBe("길이");
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("AI balance debate (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { runDebate } = await import("@/lib/jobs/debate");

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  const gen = {
    opinion: async (_p: unknown, a: string, b: string) => ({ side: (Math.random() < 0.5 ? "A" : "B") as "A" | "B", text: `${a}보다 ${b}... 성향상 이쪽이에요.` }),
    rebut: async () => "그 기준이면 반대로도 볼 수 있어요.",
  };

  it("does nothing without the room, then posts once a day with opinions and threaded rebuttals", async () => {
    expect((await runDebate("2026-10-16", gen)).reason).toBe("no room");
    await query("INSERT INTO categories (name, slug, description, sort_order) VALUES ('AI 밸런스 토론방', $1, '', 1000)", [DEBATE_ROOM_SLUG]);
    const r = await runDebate("2026-10-16", gen);
    expect(r.ran).toBe(true);
    expect(r.opinions).toBe(10);
    const [post] = await query<{ title: string; is_ai_curated: boolean }>("SELECT title, is_ai_curated FROM posts WHERE id = $1", [r.postId]);
    expect(post).toMatchObject({ title: `⚖️ ${DEBATE_TOPICS[0]![0]} vs ${DEBATE_TOPICS[0]![1]}`, is_ai_curated: true });
    const comments = await query<{ parent_id: string | null; is_ai_curated: boolean }>("SELECT parent_id, is_ai_curated FROM comments WHERE post_id = $1", [r.postId]);
    expect(comments.every((c) => c.is_ai_curated)).toBe(true);
    expect(comments.filter((c) => !c.parent_id)).toHaveLength(10);
    expect(comments.filter((c) => c.parent_id).length).toBe(r.replies);
    expect((await runDebate("2026-10-16", gen)).reason).toBe("already posted");
  });

  it("skips the day when too few opinions survive the checks", async () => {
    const bad = { opinion: async () => ({ side: "A" as const, text: "제가 먹어 봤는데요" }), rebut: async () => null };
    expect((await runDebate("2026-10-17", bad)).reason).toBe("only 0 opinions");
  });
});
