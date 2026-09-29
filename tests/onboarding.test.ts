import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { boardGuide, findTemplate, THIN_BOARD_POSTS } from "@/lib/onboarding";

describe("onboarding guides (Sprint 32)", () => {
  const seeded = readFileSync(path.join(process.cwd(), "db", "migrations", "002_seed_categories.sql"), "utf8");
  const slugs = [...seeded.matchAll(/'([a-z-]+)',\s+'/g)].map((m) => m[1]!);

  it("has a specific guide for every seeded board and a generic one for new boards", () => {
    expect(slugs).toEqual(["supplements", "keyboards", "deskterior", "pet-food", "perfume-audio"]);
    for (const s of slugs) expect(boardGuide(s)).not.toBe(boardGuide("voted-in-board"));
    expect(boardGuide(undefined).templates.length).toBeGreaterThan(0);
  });

  it("templates have unique keys, fit the editor limits and are found by key only", () => {
    const all = [...slugs.flatMap((s) => boardGuide(s).templates), ...boardGuide("x").templates];
    expect(new Set(all.map((t) => t.key)).size).toBe(all.length);
    for (const t of all) {
      expect(t.title.length).toBeLessThanOrEqual(120);
      expect(t.body.length).toBeGreaterThanOrEqual(10);
      expect(findTemplate(t.key)).toBe(t);
    }
    expect(findTemplate("../etc")).toBeNull();
    expect(findTemplate("nope")).toBeNull();
    expect(THIN_BOARD_POSTS).toBe(5);
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("onboarding queries (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query, tx } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const posts = await import("@/lib/repo/posts");
  const { boardNeeds, resetSiteStatsCache, siteStats } = await import("@/lib/repo/onboarding");
  const renewals = await import("@/lib/repo/renewals");

  let seq = 0;
  async function post(brand: string, name: string, opts: { type?: "info" | "chat"; value?: number; daysAgo?: number } = {}) {
    const n = ++seq;
    const p = await posts.createPost({
      categorySlug: "supplements", nickname: "작성자", pin: "1234", title: `${brand} ${name} ${n}`, body: "라벨에 적힌 값을 정리했습니다.",
      postType: opts.type ?? "info",
      summary: { lines: ["하나", "둘", "셋"], model: "author", isAuthorEdited: true }, fingerprint: String(n).padStart(64, "0"),
      network: `net${n}`,
      products: [{ brand, name }],
      ...(opts.value ? { facts: [{ product: 0, attribute: "마그네슘", value: opts.value, unit: "mg", basis: "", kind: "label" as const }] } : {}),
    });
    if (opts.daysAgo) await query("UPDATE posts SET created_at = now() - make_interval(days => $2) WHERE id = $1", [p.id, opts.daysAgo]);
    return p;
  }
  let supplements = 0;

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
    await resetRateLimits();
    supplements = (await query<{ id: number }>("SELECT id FROM categories WHERE slug = 'supplements'"))[0]!.id;
  });
  afterAll(async () => {
    await pool().end();
  });

  it("counts visible info posts, lists lonely products and renewals that need one more report", async () => {
    expect(await boardNeeds(supplements)).toEqual({ infoPosts: 0, pending: [], lonely: [] });
    await post("NOW", "Zinc", { daysAgo: 2 });
    await post("NOW", "Iron", { type: "chat", daysAgo: 1 });
    await post("NOW", "Magnesium", { daysAgo: 1 });
    await post("NOW", "Magnesium", { daysAgo: 1 });
    await post("NOW", "Fresh"); // 방금 올린 글의 제품은 1시간 동안 안내에 걸지 않는다 (Sprint 33)
    const hidden = await post("Solgar", "D3");
    await query("UPDATE posts SET is_blinded = true WHERE id = $1", [hidden.id]);
    let n = await boardNeeds(supplements);
    expect(n.infoPosts).toBe(4); // 잡담·블라인드 제외
    // 글이 하나뿐인 제품: 정보 글만(잡담에만 붙은 Iron 제외), 두 글 제품·블라인드·방금 올린 제품 제외
    expect(n.lonely.map((p) => p.name)).toEqual(["Zinc"]);
    expect(n.lonely.map((p) => p.name)).not.toContain("Magnesium");

    // 리뉴얼 확인 중(새 값 제보 1명) → 제보가 더 필요한 제품 (정보 글이 5개 미만이게 앞의 글은 가린다)
    await query("UPDATE posts SET is_blinded = true WHERE title LIKE 'NOW %'");
    await post("Doctor", "Mag", { value: 200, daysAgo: 100 });
    await post("Doctor", "Mag", { value: 200, daysAgo: 90 });
    await post("Doctor", "Mag", { value: 150, daysAgo: 10 });
    await tx((c) => renewals.refreshRenewals(c));
    n = await boardNeeds(supplements);
    expect(n.pending.map((r) => [r.product.name, r.new_authors])).toEqual([["Mag", 1]]);

    resetSiteStatsCache();
    expect(await siteStats()).toEqual({ posts: 3, products: 1, boards: 5 });
    // 5분 동안 재사용 (요청마다 전체를 세지 않게)
    await post("Cache", "Item");
    expect(await siteStats()).toEqual({ posts: 3, products: 1, boards: 5 });
    resetSiteStatsCache();
    expect((await siteStats()).posts).toBe(4);

    // 정보 글이 5개 이상이면 다른 조회를 하지 않고 바로 끝낸다
    for (let i = 0; i < 3; i++) await post("Bulk", `P${i}`, { daysAgo: 1 });
    expect(await boardNeeds(supplements)).toEqual({ infoPosts: 5, pending: [], lonely: [] });
  });
});
