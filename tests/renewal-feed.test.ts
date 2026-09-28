import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { snapshotKey } from "@/lib/snapshots";
import { renewalTitle, renewalWhen } from "@/lib/renewal-text";
import { brandKey } from "@/lib/repo/renewal-feed";

describe("renewal feed helpers", () => {
  it("makes brand keys the same way as product keys", () => {
    expect(brandKey("NOW Foods")).toBe("nowfoods");
    expect(brandKey(" 나우 푸드 ")).toBe("나우푸드");
    expect(brandKey("Doctor's Best")).toBe("doctorsbest");
  });

  it("stores the new pages for read-only mode", () => {
    expect(snapshotKey("/renewals?status=pending&x=1")).toBe("/renewals?status=pending");
    expect(snapshotKey("/c/supplements/renewals")).toBe("/c/supplements/renewals");
    expect(snapshotKey("/brand/nowfoods")).toBe("/brand/nowfoods");
  });

  it("describes a renewal in one line", () => {
    const r = {
      id: "1", status: "confirmed" as const, product: { id: "9", brand: "NOW", name: "Magnesium" }, brand_key: "now",
      category: { slug: "supplements", name: "영양제" }, attribute: "마그네슘", basis: "1정", unit: "mg", from: 200, to: 150, change_pct: -25,
      last_old_at: "2026-03-02T00:00:00Z", first_new_at: "2026-05-20T00:00:00Z", time_basis: "made" as const, confirmed_at: "2026-09-01T00:00:00Z",
      new_reports: 2, new_authors: 2, new_photos: 1,
    };
    expect(renewalTitle(r)).toBe("NOW Magnesium: 마그네슘(1정) 200 → 150 mg (−25%)");
    expect(renewalWhen(r)).toBe("제조 2026년 3월~5월 사이에 바뀜");
    expect(renewalWhen({ ...r, time_basis: "posted" })).toBe("2026년 3월~5월 사이에 바뀜 (글 올린 시기로 추정)");
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("renewal feed (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query, tx } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const posts = await import("@/lib/repo/posts");
  const renewals = await import("@/lib/repo/renewals");
  const feed = await import("@/lib/repo/renewal-feed");
  const operator = await import("@/lib/repo/operator");
  const allRoute = await import("../src/app/renewals.xml/route");
  const boardRoute = await import("../src/app/c/[slug]/renewals.xml/route");

  let seq = 0;
  async function report(board: string, brand: string, name: string, attribute: string, value: number, unit: string, daysAgo: number) {
    const n = ++seq;
    const p = await posts.createPost({
      categorySlug: board, nickname: "작성자", pin: "1234", title: `${brand} ${name} 라벨 ${n}`, body: "라벨에 적힌 값을 정리했습니다.",
      summary: { lines: ["하나", "둘", "셋"], model: "author", isAuthorEdited: true },
      fingerprint: String(n).padStart(64, "0"),
      products: [{ brand, name }],
      facts: [{ product: 0, attribute, value, unit, basis: "", kind: "label" }],
    });
    await query("UPDATE posts SET created_at = now() - make_interval(days => $2) WHERE id = $1", [p.id, daysAgo]);
    return p.id;
  }
  /** 옛 값 2명 → 새 값 newN명 */
  async function renewal(board: string, brand: string, name: string, attribute: string, from: number, to: number, unit: string, newN = 2) {
    await report(board, brand, name, attribute, from, unit, 100);
    await report(board, brand, name, attribute, from, unit, 90);
    for (let i = 0; i < newN; i++) await report(board, brand, name, attribute, to, unit, 20 - i);
  }
  const pid = async (name: string) => (await query<{ id: string }>("SELECT id::text FROM products WHERE name = $1", [name]))[0]!.id;
  const refresh = () => tx((c) => renewals.refreshRenewals(c));
  let supplements = 0;

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
    await resetRateLimits();
    await renewal("supplements", "NOW Foods", "Magnesium Citrate", "마그네슘", 200, 150, "mg");
    await renewal("supplements", "NOW Foods", "Vitamin D3", "비타민 D3", 25, 50, "µg");
    await renewal("supplements", "NOW Foods", "Zinc", "아연", 30, 15, "mg", 1); // 확인 중
    await renewal("keyboards", "Gateron", "Yellow", "작동압", 50, 55, "g");
    await refresh();
    // 확인 순서가 정해지게
    await query("UPDATE product_renewals r SET confirmed_at = now() - make_interval(hours => r.id::int) WHERE status = 'confirmed'");
    supplements = (await query<{ id: number }>("SELECT id FROM categories WHERE slug = 'supplements'"))[0]!.id;
  });
  afterAll(async () => {
    await pool().end();
  });

  it("lists confirmed renewals newest first, by board and by brand, with display values", async () => {
    const all = await feed.listRenewals();
    expect(all.total).toBe(3);
    expect(all.items.map((r) => [r.product.name, r.from, r.to, r.unit])).toEqual([
      ["Magnesium Citrate", 200, 150, "mg"],
      ["Vitamin D3", 25, 50, "µg"],
      ["Yellow", 50, 55, "g"],
    ]);
    expect(all.items[0]).toMatchObject({ brand_key: "nowfoods", category: { slug: "supplements" }, change_pct: -25, new_authors: 2, time_basis: "posted" });
    expect((await feed.listRenewals({ categoryId: supplements })).items.map((r) => r.product.name)).toEqual(["Magnesium Citrate", "Vitamin D3"]);
    expect((await feed.listRenewals({ brandKey: "gateron" })).items.map((r) => r.product.name)).toEqual(["Yellow"]);
    const pending = await feed.listRenewals({ status: "pending" });
    expect(pending.items.map((r) => [r.product.name, r.from, r.to, r.new_authors])).toEqual([["Zinc", 30, 15, 1]]);
    const page2 = await feed.listRenewals({ pageSize: 2, page: 2 });
    expect(page2).toMatchObject({ total: 3, page: 2 });
    expect(page2.items.map((r) => r.product.name)).toEqual(["Yellow"]);
    expect((await feed.listRenewals({ since: new Date(Date.now() - 90 * 60_000) })).total).toBe(1);
  });

  it("summarises a brand's history", async () => {
    const h = (await feed.brandHistory("nowfoods"))!;
    expect(h).toMatchObject({ brand: "NOW Foods", stats: { products: 3, renewed_products: 2, renewals: 2, decreased: 1, increased: 1 } });
    expect(h.renewals.map((r) => r.product.name)).toEqual(["Magnesium Citrate", "Vitamin D3"]);
    expect(h.pending.map((r) => r.product.name)).toEqual(["Zinc"]);
    expect(h.products.find((p) => p.name === "Zinc")).toMatchObject({ renewals: 0, pending: 1, post_count: 3 });
    expect(await feed.brandHistory("NOW Foods")).toBeNull(); // 정규화된 키만
    expect(await feed.brandHistory("nobrand")).toBeNull();
    expect(await feed.topRenewalBrands()).toEqual([
      { key: "nowfoods", brand: "NOW Foods", renewals: 2, products: 2 },
      { key: "gateron", brand: "Gateron", renewals: 1, products: 1 },
    ]);
  });

  it("serves Atom feeds for all boards and one board", async () => {
    const res = await allRoute.GET();
    expect(res.headers.get("content-type")).toBe("application/atom+xml; charset=utf-8");
    const xml = await res.text();
    expect(xml.match(/<entry>/g)).toHaveLength(3);
    expect(xml).toContain("<title>NOW Foods Magnesium Citrate: 마그네슘 200 → 150 mg (−25%)</title>");
    expect(xml).toContain(`<link href="http://localhost:3000/p/${await pid("Magnesium Citrate")}"/>`);
    expect(xml).toContain("제조사 발표가 아닙니다");
    const board = await (await boardRoute.GET(new Request("http://x"), { params: Promise.resolve({ slug: "keyboards" }) })).text();
    expect(board.match(/<entry>/g)).toHaveLength(1);
    expect((await boardRoute.GET(new Request("http://x"), { params: Promise.resolve({ slug: "nope" }) })).status).toBe(404);
  });

  it("hides products without visible posts and merged products", async () => {
    await query("UPDATE posts SET is_blinded = true WHERE id IN (SELECT post_id FROM post_products WHERE product_id = $1)", [await pid("Yellow")]);
    expect((await feed.listRenewals()).items.map((r) => r.product.name)).toEqual(["Magnesium Citrate", "Vitamin D3"]);
    expect(await feed.brandHistory("gateron")).toBeNull();
    await query("UPDATE posts SET is_blinded = false");

    // Vitamin D3 를 같은 브랜드의 다른 제품으로 병합 → 병합된 제품의 기록은 목록에서 빠지고 재계산된다
    await posts.createPost({
      categorySlug: "supplements", nickname: "작성자", pin: "1234", title: "NOW 비타민 D3 5000IU 라벨", body: "라벨에 적힌 값을 정리했습니다.",
      summary: { lines: ["하나", "둘", "셋"], model: "author", isAuthorEdited: true }, fingerprint: "e".repeat(64),
      products: [{ brand: "NOW Foods", name: "Vitamin D3 5000" }],
    });
    await operator.mergeProduct(await pid("Vitamin D3"), await pid("Vitamin D3 5000"), "같은 제품");
    const names = (await feed.listRenewals()).items.map((r) => r.product.name);
    expect(names).not.toContain("Vitamin D3");
    expect(names).toContain("Vitamin D3 5000");
  });
});
