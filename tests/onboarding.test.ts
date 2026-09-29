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
  const { boardNeeds, siteStats } = await import("@/lib/repo/onboarding");
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
    await post("NOW", "Zinc");
    await post("NOW", "Iron", { type: "chat" });
    await post("NOW", "Magnesium");
    await post("NOW", "Magnesium");
    const hidden = await post("Solgar", "D3");
    await query("UPDATE posts SET is_blinded = true WHERE id = $1", [hidden.id]);
    let n = await boardNeeds(supplements);
    expect(n.infoPosts).toBe(3); // 잡담·블라인드 제외
    expect(n.lonely.map((p) => p.name)).toEqual(["Iron", "Zinc"]); // 글이 하나뿐인 제품 (최근 순), 두 글 제품·블라인드 제외
    expect(n.lonely.map((p) => p.name)).not.toContain("Magnesium");

    // 리뉴얼 확인 중(새 값 제보 1명) → 제보가 더 필요한 제품
    await post("Doctor", "Mag", { value: 200, daysAgo: 100 });
    await post("Doctor", "Mag", { value: 200, daysAgo: 90 });
    await post("Doctor", "Mag", { value: 150, daysAgo: 10 });
    await tx((c) => renewals.refreshRenewals(c));
    n = await boardNeeds(supplements);
    expect(n.pending.map((r) => [r.product.name, r.new_authors])).toEqual([["Mag", 1]]);

    expect(await siteStats()).toEqual({ posts: 7, products: 4, boards: 5 });
  });
});
