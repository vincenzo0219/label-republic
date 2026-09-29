import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CuratorDraft, CuratorGenerator } from "@/lib/curator-ai";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("AI curator keeps posting after the seeds run out (database, Sprint 37)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { runCuratorBatch } = await import("@/lib/jobs/curator");

  const draft = (title: string, extra: Partial<CuratorDraft> = {}): CuratorDraft => ({
    title,
    body: "라벨의 1회 제공량과 표기 기준을 함께 읽어야 제품끼리 비교할 수 있습니다. ".repeat(10) + "\n확인 체크리스트\n- 라벨의 1회 제공량을 확인합니다.",
    summary: ["1회 제공량 기준을 먼저 봅니다.", "표기 기준이 다르면 비교할 수 없습니다.", "실제 라벨을 확인합니다."],
    comments: ["Q. 1일 섭취량과 1회 제공량은? / A. 라벨에 따라 다릅니다."],
    ...extra,
  });
  let calls: { slug: string; recent: string[] }[] = [];
  const fake = (make: (slug: string) => CuratorDraft | null): CuratorGenerator => async (board, recent) => {
    calls.push({ slug: board.slug, recent });
    return make(board.slug);
  };
  const onlyBoard = async (slug: string) => {
    // 다른 보드는 사람 글로 채워 물러나게 해서 한 보드만 본다
    await query(
      `INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type)
       SELECT c.id, '사람', 'x', '사람 글 ' || g, '본문', 'info' FROM categories c, generate_series(1, 20) g WHERE c.slug <> $1`,
      [slug],
    );
  };

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  beforeEach(async () => {
    await query("TRUNCATE posts, curator_queue, curator_generations, curator_runs RESTART IDENTITY CASCADE");
    calls = [];
  });
  afterAll(async () => {
    await pool().end();
  });

  it("writes a new post when the queue is empty and publishes it without review, with the board's recent titles", async () => {
    await onlyBoard("keyboards");
    await query(
      `INSERT INTO posts (category_id, nickname, pw_hash, title, body, is_ai_curated, seed_key)
       SELECT id, 'AI 큐레이터', '!ai-curator', '예전 글', '본문', true, 'old-seed' FROM categories WHERE slug = 'keyboards'`,
    );
    await query("UPDATE posts SET created_at = now() - interval '13 hours' WHERE seed_key = 'old-seed'");
    const r = await runCuratorBatch(new Date(), { generate: fake(() => draft("스위치 스펙표 읽는 법")), dailyMax: 10 });
    expect(calls).toEqual([{ slug: "keyboards", recent: ["예전 글"] }]);
    const kb = r.categories.find((c) => c.slug === "keyboards")!;
    expect(kb).toMatchObject({ reason: "autogen published" });
    const post = (await query<{ title: string; is_ai_curated: boolean; ai_reviewed: boolean; seed_key: string; comment_count: number }>(
      "SELECT title, is_ai_curated, ai_reviewed, seed_key, comment_count FROM posts WHERE id = $1",
      [kb.published],
    ))[0]!;
    expect(post).toMatchObject({ title: "스위치 스펙표 읽는 법", is_ai_curated: true, ai_reviewed: false, comment_count: 1 });
    expect(post.seed_key).toMatch(/^auto-keyboards-/);
    expect((await query<{ status: string }>("SELECT status FROM curator_generations"))[0]!.status).toBe("published");
    // 게시 간격(12시간)이 지나기 전에는 다시 쓰지 않는다
    calls = [];
    await runCuratorBatch(new Date(), { generate: fake(() => draft("또 다른 글")), dailyMax: 10 });
    expect(calls).toEqual([]);
  });

  it("does not publish drafts that fail the safety check, and records why", async () => {
    await onlyBoard("supplements");
    const r = await runCuratorBatch(new Date(), { generate: fake(() => draft("마그네슘이 불면증을 완치", { body: draft("x").body + " 불면증을 완치합니다." })), dailyMax: 10 });
    expect(r.categories.find((c) => c.slug === "supplements")).toMatchObject({ published: null, reason: expect.stringContaining("autogen rejected") });
    expect(await query("SELECT 1 FROM posts WHERE is_ai_curated")).toHaveLength(0);
    const g = (await query<{ status: string; reasons: string }>("SELECT status, reasons FROM curator_generations"))[0]!;
    expect(g.status).toBe("rejected");
    expect(g.reasons).toContain("완치");
  });

  it("stops at the daily attempt limit, and does nothing when autogen is off or a draft fails", async () => {
    await onlyBoard("deskterior");
    await query(
      "INSERT INTO curator_generations (category_id, status) SELECT id, 'rejected' FROM categories, generate_series(1, 2) WHERE slug = 'deskterior'",
    );
    let r = await runCuratorBatch(new Date(), { generate: fake(() => draft("데스크 셋업 조명 읽는 법")), dailyMax: 2 });
    expect(calls).toEqual([]);
    expect(r.categories.find((c) => c.slug === "deskterior")!.reason).toBe("queue empty (autogen daily limit)");
    await query("TRUNCATE curator_generations");
    r = await runCuratorBatch(new Date(), { generate: fake(() => null), dailyMax: 2 });
    expect(r.categories.find((c) => c.slug === "deskterior")!.reason).toBe("autogen failed");
    expect((await query<{ status: string }>("SELECT status FROM curator_generations"))[0]!.status).toBe("failed");
  });

  it("prefers queued seeds and keeps the review flag", async () => {
    await onlyBoard("pet-food");
    await query(
      `INSERT INTO curator_queue (category_id, seed_key, title, body, summary_lines, comments, priority, reviewed)
       SELECT id, 'q1', '대기열 글', '본문', ARRAY['a','b','c'], '[]', 1, true FROM categories WHERE slug = 'pet-food'`,
    );
    const r = await runCuratorBatch(new Date(), { generate: fake(() => draft("쓰면 안 됨")), dailyMax: 10 });
    expect(calls).toEqual([]);
    const id = r.categories.find((c) => c.slug === "pet-food")!.published;
    expect((await query<{ ai_reviewed: boolean }>("SELECT ai_reviewed FROM posts WHERE id = $1", [id]))[0]!.ai_reviewed).toBe(true);
  });
});
