import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { changePeriodText, detectEras, renewalsOf, type LabelReport } from "@/lib/renewals";
import type { Product } from "@/lib/repo/products";

const DAY = 86_400_000;
const r = (i: number, base: number, author: string | null = `a${i}`, photo = false): LabelReport => ({ post_id: String(i), at: i * DAY, base, author, photo });
const values = (x: ReturnType<typeof detectEras>) => x.eras.map((e) => e.base);

describe("label era detection", () => {
  it("finds a renewal when the new value is reported by enough different people", () => {
    const x = detectEras([r(1, 200), r(2, 200), r(3, 201), r(4, 150), r(5, 150), r(6, 150)]);
    expect(values(x)).toEqual([200, 150]);
    expect(x.pending).toBeNull();
    expect(renewalsOf(x.eras)).toEqual([{ from: 200, to: 150, last_old_at: 3 * DAY, first_new_at: 4 * DAY, new_n: 3, new_authors: 3, new_photos: 0 }]);
    // 이 순서로 들어오지 않아도 된다
    expect(values(detectEras([r(5, 150), r(1, 200), r(4, 150), r(2, 200)]))).toEqual([200, 150]);
  });

  it("tolerates a few old-stock reports after the change", () => {
    const x = detectEras([r(1, 200), r(2, 200), r(3, 150), r(4, 150), r(5, 200), r(6, 150)]);
    expect(values(x)).toEqual([200, 150]);
    expect(x.eras[1]).toMatchObject({ n: 3, stray: 1, start_at: 3 * DAY });
  });

  it("does not treat a single typo or one person's repeated value as a renewal", () => {
    expect(values(detectEras([r(1, 200), r(2, 20), r(3, 200), r(4, 200)]))).toEqual([200]);
    const same = detectEras([r(1, 200), r(2, 200), r(3, 150, "x"), r(4, 150, "x")]);
    expect(values(same)).toEqual([200]);
    expect(same.pending).toMatchObject({ from: 200, to: 150, n: 2, authors: 1 });
  });

  it("marks a recent differing report as pending until enough people confirm", () => {
    const x = detectEras([r(1, 200), r(2, 200), r(3, 150, "b", true)]);
    expect(values(x)).toEqual([200]);
    expect(x.pending).toMatchObject({ from: 200, to: 150, n: 1, authors: 1, photos: 1, post_ids: ["3"] });
    // 기준 수는 커뮤니티 규칙 — 3명이면 2명으로는 아직 확인 중
    const three = detectEras([r(1, 200), r(2, 200), r(3, 150), r(4, 150)], 3);
    expect(values(three)).toEqual([200]);
    expect(three.pending).toMatchObject({ n: 2, authors: 2 });
    expect(values(detectEras([r(1, 200), r(2, 200), r(3, 150), r(4, 150), r(5, 150)], 3))).toEqual([200, 150]);
  });

  it("needs the old value to be established (two people or a photo)", () => {
    expect(values(detectEras([r(1, 200), r(3, 150), r(4, 150)]))).toEqual([150]);
    expect(values(detectEras([r(1, 200, "o", true), r(3, 150), r(4, 150)]))).toEqual([200, 150]);
  });

  it("does not split values that are interleaved in time (regional versions etc.)", () => {
    const x = detectEras([r(1, 200), r(2, 150), r(3, 200), r(4, 150), r(5, 200), r(6, 150)]);
    expect(x.eras).toHaveLength(1);
  });

  it("finds consecutive renewals and a revert", () => {
    expect(values(detectEras([r(1, 100), r(2, 100), r(3, 120), r(4, 120), r(5, 90), r(6, 90)]))).toEqual([100, 120, 90]);
    expect(values(detectEras([r(1, 100), r(2, 100), r(3, 120), r(4, 120), r(5, 100), r(6, 100)]))).toEqual([100, 120, 100]);
  });

  it("treats values within 2% as the same, and anonymous reports as different people", () => {
    expect(values(detectEras([r(1, 1000), r(2, 1010), r(3, 995)]))).toHaveLength(1);
    expect(values(detectEras([r(1, 200, null), r(2, 200, null), r(3, 150, null), r(4, 150, null)]))).toEqual([200, 150]);
  });

  it("stays fast on many reports", () => {
    const many = Array.from({ length: 1000 }, (_, i) => r(i + 1, i < 800 ? 200 : 150, `a${i % 50}`));
    const t = performance.now();
    const x = detectEras(many);
    expect(performance.now() - t).toBeLessThan(1500);
    // 최근 300건(200 100건 → 150 200건)만 본다
    expect(values(x)).toEqual([200, 150]);
    expect(x.eras[0]!.n).toBe(100);
  });

  it("describes when the change happened by month (KST)", () => {
    const at = (s: string) => new Date(s).getTime();
    expect(changePeriodText(at("2026-03-02T00:00:00+09:00"), at("2026-03-20T00:00:00+09:00"))).toBe("2026년 3월");
    expect(changePeriodText(at("2026-03-02T00:00:00+09:00"), at("2026-05-20T00:00:00+09:00"))).toBe("2026년 3월~5월 사이");
    expect(changePeriodText(at("2025-12-31T23:30:00+09:00"), at("2026-02-01T00:30:00+09:00"))).toBe("2025년 12월~2026년 2월 사이");
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("product renewals (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query, tx } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const posts = await import("@/lib/repo/posts");
  const products = await import("@/lib/repo/products");
  const facts = await import("@/lib/repo/facts");
  const renewals = await import("@/lib/repo/renewals");
  const watch = await import("@/lib/repo/watch");
  const operator = await import("@/lib/repo/operator");
  const rules = await import("@/lib/repo/rules");
  const { runMaintenance } = await import("@/lib/jobs/maintenance");
  const { pushMessage } = await import("@/lib/jobs/push");

  const fp = (n: number) => String(n).padStart(64, "0");
  let seq = 0;
  /** daysAgo 에 올라온 글: 제품 하나, 마그네슘 표시값 (1정) */
  async function report(value: number, daysAgo: number, opts: { author?: number; brand?: string; name?: string; unit?: string; measured?: number } = {}) {
    const n = ++seq;
    const p = await posts.createPost({
      categorySlug: "supplements", nickname: "작성자", pin: "1234",
      title: `${opts.brand ?? "NOW"} 마그네슘 라벨 ${n}`, body: "라벨에 적힌 성분 함량을 정리했습니다.",
      summary: { lines: ["하나", "둘", "셋"], model: "author", isAuthorEdited: true },
      fingerprint: fp(opts.author ?? n),
      products: [{ brand: opts.brand ?? "NOW", name: opts.name ?? "Magnesium Citrate" }],
      facts: [
        { product: 0, attribute: "마그네슘", value, unit: opts.unit ?? "mg", basis: "1정", kind: "label" as const },
        ...(opts.measured !== undefined ? [{ product: 0, attribute: "마그네슘", value: opts.measured, unit: "mg", basis: "1정", kind: "measured" as const }] : []),
      ],
    });
    // 올라온 시각만 과거로 (updated_at 은 지금 — 정리 배치가 "새로 바뀐 글"로 본다)
    await query("UPDATE posts SET created_at = now() - make_interval(days => $2) WHERE id = $1", [p.id, daysAgo]);
    return p.id;
  }
  const productId = async (brand = "NOW") => (await query<{ id: string }>("SELECT id::text FROM products WHERE brand = $1", [brand]))[0]!.id;
  const refresh = () => tx((c) => renewals.refreshRenewals(c));
  const stored = () =>
    query<{ status: string; old_base: number; new_base: number; confirmed_at: string | null; new_authors: number }>(
      "SELECT status, old_base, new_base, confirmed_at, new_authors FROM product_renewals ORDER BY id",
    );

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  beforeEach(async () => {
    await resetRateLimits();
    await query("TRUNCATE posts, products, fingerprints, product_renewals, rule_changes, moderation_log RESTART IDENTITY CASCADE");
    await query("UPDATE renewal_scans SET scanned_until = 'epoch', full_at = 'epoch'");
    await query("UPDATE community_rules SET value = NULL");
    rules.invalidateRules();
    facts.clearFactCache();
    seq = 0;
  });
  afterAll(async () => {
    await pool().end();
  });

  it("shows the current label on the product page and keeps older values as history", async () => {
    await report(200, 90, { measured: 190 });
    await report(200, 80);
    await report(150, 20, { measured: 140 });
    await report(150, 10, { unit: "mg" });
    await report(0.15, 5, { unit: "g" }); // 단위가 달라도 같은 값
    const [g] = await products.productFacts(await productId());
    expect(g).toMatchObject({ label: { median: 150, n: 3 }, measured: { median: 140, n: 1 }, pending: null });
    expect(g!.eras!.map((e) => e.value)).toEqual([200, 150]);
    expect(g!.entries.filter((e) => e.old)).toHaveLength(3); // 옛 시기 표시값 2 + 실측 1
    expect(g!.diff_pct).toBeCloseTo(((140 - 150) / 150) * 100);
  });

  it("keeps the old behaviour (median of all) when there is no renewal", async () => {
    await report(200, 30);
    await report(210, 20);
    const [g] = await products.productFacts(await productId());
    expect(g).toMatchObject({ eras: null, current_since: null, label: { median: 205, n: 2 } });
  });

  it("stores renewals from the maintenance job, keeps the first confirmation time and notifies watchers once", async () => {
    await report(200, 90);
    await report(200, 80);
    await report(150, 20);
    const pid = await productId();
    await refresh();
    expect(await stored()).toMatchObject([{ status: "pending", old_base: 200, new_base: 150, confirmed_at: null }]);

    const before = new Date(Date.now() - 1000);
    await report(150, 10);
    const r1 = await refresh();
    expect(r1).toMatchObject({ confirmed: 1, full: false });
    const [row] = await stored();
    expect(row).toMatchObject({ status: "confirmed", new_authors: 2 });

    // 새 제보가 더 와도 같은 리뉴얼 — 확인 시각 유지, 다시 알리지 않음
    await report(151, 5);
    expect((await refresh()).confirmed).toBe(0);
    expect((await stored())[0]!.confirmed_at).toEqual(row!.confirmed_at);

    const u = await watch.watchUpdates([pid], [], before, null);
    expect(u.products[0]!.renewals).toEqual([{ attribute: "마그네슘", basis: "1정", unit: "mg", from: 200, to: 150 }]);
    expect(u.total).toBe(u.products[0]!.new_posts + 1);
    expect(pushMessage(u).body).toMatch(/^🔄 마그네슘 라벨 변경 200→150mg/);
    expect((await watch.watchUpdates([pid], [], new Date(), null)).products[0]!.renewals).toEqual([]);
  });

  it("uses only post-renewal values in fact rankings", async () => {
    await report(200, 90);
    await report(200, 80);
    await report(150, 20);
    await report(150, 10);
    await report(170, 30, { brand: "Doctor's Best", name: "Magnesium" });
    await refresh();
    const cat = (await query<{ id: number }>("SELECT id FROM categories WHERE slug = 'supplements'"))[0]!.id;
    const res = await facts.rankProducts({ categoryId: cat, attrKey: "마그네슘", basisKey: "1정" });
    expect(res!.items.map((i) => [i.brand, i.value, i.n_label])).toEqual([
      ["Doctor's Best", 170, 1],
      ["NOW", 150, 2],
    ]);
  });

  it("drops a renewal when the new-value posts disappear, and recomputes after a product merge", async () => {
    await report(200, 90);
    await report(200, 80);
    const a = await report(150, 20);
    await report(150, 10);
    await refresh();
    expect(await stored()).toHaveLength(1);
    // 블라인드는 시각이 남지 않아 하루 한 번 전체 계산에서 반영된다
    await query("UPDATE posts SET is_blinded = true WHERE id = $1", [a]);
    await query("UPDATE renewal_scans SET full_at = 'epoch'");
    expect(await refresh()).toMatchObject({ full: true });
    expect(await stored()).toMatchObject([{ status: "pending" }]);

    // 다른 이름으로 등록된 같은 제품의 새 값 글 → 병합하면 바로 확인됨
    await report(150, 5, { name: "Magnesium Citrate 200" });
    const into = await productId();
    const from = (await query<{ id: string }>("SELECT id::text FROM products WHERE name = 'Magnesium Citrate 200'"))[0]!.id;
    await operator.mergeProduct(from, into, "같은 제품");
    expect(await stored()).toMatchObject([{ status: "confirmed", new_authors: 2 }]);
  });

  it("follows the community rule for how many people must confirm", async () => {
    await report(200, 90);
    await report(200, 80);
    await report(150, 20);
    await report(150, 10);
    await query("UPDATE community_rules SET value = 3 WHERE key = 'renewal_min_reports'");
    rules.invalidateRules();
    const [g] = await products.productFacts(await productId());
    expect(g).toMatchObject({ eras: null, pending: { from: 200, to: 150, authors: 2, needed: 1 } });
    await runMaintenance();
    expect(await stored()).toMatchObject([{ status: "pending" }]);
  });

  it("marks renewed cells in the compare table", async () => {
    await report(200, 90);
    await report(200, 80);
    await report(150, 20);
    await report(150, 10);
    await report(170, 30, { brand: "Doctor's Best", name: "Magnesium" });
    const ps = await Promise.all([productId(), productId("Doctor's Best")].map(async (id) => (await products.getProduct(await id)) as Product));
    const [row] = await products.compareProducts(ps);
    expect(row!.cells).toMatchObject([{ label: 150, renewed: true }, { label: 170, renewed: false }]);
  });
});
