import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BOARD_EARLY_STAGE_ACTIVE, BOARD_THRESHOLD_FLOOR, effectiveBoardThreshold, promotionWaitHours } from "@/lib/repo/board-requests";
import { boardGuide } from "@/lib/onboarding";

describe("room creation threshold (Sprint 39)", () => {
  it("1 person opens a room early on, then 3+ growing with 5% of 30-day actives, never past the voted cap (Sprint 39, 49)", () => {
    expect(BOARD_THRESHOLD_FLOOR).toBe(3);
    expect(BOARD_EARLY_STAGE_ACTIVE).toBe(50);
    expect(effectiveBoardThreshold(50, 0)).toBe(1);
    expect(effectiveBoardThreshold(50, 49)).toBe(1);
    expect(effectiveBoardThreshold(50, 50)).toBe(3);
    expect(effectiveBoardThreshold(50, 60)).toBe(3);
    expect(effectiveBoardThreshold(50, 61)).toBe(4);
    expect(effectiveBoardThreshold(50, 200)).toBe(10);
    expect(effectiveBoardThreshold(50, 1000)).toBe(50);
    expect(effectiveBoardThreshold(50, 100_000)).toBe(50);
    // 상한이 바닥보다 낮게 설정돼 있으면 상한을 따른다 (운영 설정이 우선)
    expect(effectiveBoardThreshold(2, 100)).toBe(2);
    // 혼자서 여는 방은 기다리지 않는다
    expect(promotionWaitHours(1, 24)).toBe(0);
    expect(promotionWaitHours(3, 24)).toBe(24);
  });

  it("new rooms get a free-talk template, not only fact templates", () => {
    const keys = boardGuide("brand-new-room").templates.map((t) => t.key);
    expect(keys[0]).toBe("generic-chat");
    expect(boardGuide("brand-new-room").templates[0]!.postType).toBe("chat");
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("room creation threshold (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const boards = await import("@/lib/repo/board-requests");
  const fp = (n: number) => `room${n}`.padStart(64, "0");

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
    await resetRateLimits();
  });
  afterAll(async () => {
    await pool().end();
  });

  it("counts only people active in the last 30 days", async () => {
    boards.resetBoardThresholdCache();
    expect(await boards.getBoardThreshold()).toMatchObject({ needed: 1, active30d: 0 });

    // 최근 활동 200명 + 40일 전에만 활동한 500명
    await query(
      `INSERT INTO fingerprints (fingerprint, first_seen, last_seen)
       SELECT lpad('a' || g, 64, '0'), now() - interval '1 day', now() - interval '1 day' FROM generate_series(1, 200) g
       UNION ALL
       SELECT lpad('b' || g, 64, '0'), now() - interval '40 days', now() - interval '40 days' FROM generate_series(1, 500) g`,
    );
    // 5분 캐시 — 비우기 전에는 그대로
    expect((await boards.getBoardThreshold()).needed).toBe(1);
    boards.resetBoardThresholdCache();
    const t = await boards.getBoardThreshold();
    expect(t).toMatchObject({ needed: 10, active30d: 200 });
    expect(t.cap).toBeGreaterThanOrEqual(10);
  });

  it("early on, the requester alone opens the room immediately — no 24h wait (Sprint 49)", async () => {
    await query("DELETE FROM fingerprints");
    boards.resetBoardThresholdCache();
    const req = await boards.createBoardRequest("커피 원두 로스팅", "원두 이야기");
    const first = await boards.voteBoardRequest(req.id, fp(1), undefined, 24);
    expect(first).toMatchObject({ promoted: true, threshold: 1, promotableAt: null });
    expect((await query("SELECT 1 FROM categories WHERE name = '커피 원두 로스팅' AND auto_promoted_at IS NOT NULL")).length).toBe(1);
  });

  it("once the community grows, several agreements and the waiting time are needed again", async () => {
    await query(
      `INSERT INTO fingerprints (fingerprint, first_seen, last_seen)
       SELECT lpad('g' || g, 64, '0'), now(), now() FROM generate_series(1, 80) g`,
    );
    boards.resetBoardThresholdCache();
    const req = await boards.createBoardRequest("필름 카메라", "필름 이야기");
    for (const n of [11, 12, 13, 14]) expect((await boards.voteBoardRequest(req.id, fp(n), undefined, 24)).promoted).toBe(false);
    const fifth = await boards.voteBoardRequest(req.id, fp(15), undefined, 24);
    expect(fifth.promoted).toBe(false);
    expect(fifth.threshold).toBe(5);
    expect(fifth.promotableAt).not.toBeNull();
    await query("DELETE FROM fingerprints WHERE fingerprint LIKE '%g%'");
    boards.resetBoardThresholdCache();
  });

  it("rejects room names with abusive or contact text at request time (Sprint 49)", async () => {
    await expect(boards.createBoardRequest("연락주세요 010-1234-5678", "")).rejects.toThrow();
  });

  it("counts visible new posts per room since the given time (Sprint 41)", async () => {
    const { newPostCounts } = await import("@/lib/repo/categories");
    const cat = async (slug: string) => (await query<{ id: number }>("SELECT id FROM categories WHERE slug = $1", [slug]))[0]!.id;
    const kb = await cat("keyboards");
    const insert = (hoursAgo: number, blinded = false) =>
      query(
        `INSERT INTO posts (category_id, nickname, pw_hash, title, body, created_at, is_blinded)
         VALUES ($1, '사람', 'x', '글', '본문', now() - make_interval(hours => $2), $3)`,
        [kb, hoursAgo, blinded],
      );
    await insert(48);
    await insert(2);
    await insert(1);
    await insert(1, true); // 블라인드 글은 세지 않음
    const since = new Date(Date.now() - 24 * 3600_000);
    expect(await newPostCounts([{ slug: "keyboards", since }, { slug: "supplements", since }, { slug: "없는방", since }])).toEqual({ keyboards: 2 });
  });

  it("shows room tools only when the room has products, numbers or label changes (Sprint 42)", async () => {
    const { roomTools } = await import("@/lib/repo/categories");
    const deskId = (await query<{ id: number }>("SELECT id FROM categories WHERE slug = 'deskterior'"))[0]!.id;
    expect(await roomTools(deskId)).toEqual({ products: false, facts: false, renewals: false });
    const post = (await query<{ id: string }>(
      "INSERT INTO posts (category_id, nickname, pw_hash, title, body) VALUES ($1, '사람', 'x', '모니터암', '본문') RETURNING id",
      [deskId],
    ))[0]!.id;
    const prod = (await query<{ id: string }>(
      "INSERT INTO products (category_id, brand, name, norm_key) VALUES ($1, '브랜드', '모니터암', '브랜드|모니터암') RETURNING id",
      [deskId],
    ))[0]!.id;
    await query("INSERT INTO post_products (post_id, product_id) VALUES ($1, $2)", [post, prod]);
    expect(await roomTools(deskId)).toEqual({ products: true, facts: false, renewals: false });
    await query(
      "INSERT INTO product_facts (post_id, product_id, attribute, attr_key, value, unit, kind) VALUES ($1, $2, '허용 하중', '허용하중', 9, 'kg', 'label')",
      [post, prod],
    );
    expect(await roomTools(deskId)).toMatchObject({ products: true, facts: true });
    // 블라인드된 글뿐이면 다시 숨김
    await query("UPDATE posts SET is_blinded = true WHERE id = $1", [post]);
    expect(await roomTools(deskId)).toEqual({ products: false, facts: false, renewals: false });
  });
});
