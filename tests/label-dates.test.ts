import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { labelDateMs, labelDatesProblem, parseLabelDate, productionTimes, readLabelDates } from "@/lib/label-dates";
import { sameDatesAsRead, sanitizeRead } from "@/lib/label-read";

const DAY = 86_400_000;
const at = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime();

describe("label date parsing", () => {
  it.each([
    ["2026-03-15", "2026-03-15", "day"],
    ["2026.03.15", "2026-03-15", "day"],
    ["2026/3/5", "2026-03-05", "day"],
    ["20260315", "2026-03-15", "day"],
    ["26.03.15", "2026-03-15", "day"],
    ["2026년 3월 15일", "2026-03-15", "day"],
    ["2026-03", "2026-03", "month"],
    ["2026.3", "2026-03", "month"],
    ["03/2027", "2027-03", "month"],
    [" 2026. 03. ", "2026-03", "month"],
  ])("%s → %s", (raw, iso, precision) => {
    expect(parseLabelDate(raw)).toEqual({ iso, precision });
  });

  it.each(["", "2026-13", "2026-02-30", "1999-01", "LOT 2403A", "2026", "15/03/2026"])("rejects %j", (raw) => {
    expect(parseLabelDate(raw)).toBeNull();
  });

  it("uses the 15th for month-only dates", () => {
    expect(labelDateMs({ iso: "2026-03", precision: "month" })).toBe(at("2026-03-15"));
    expect(labelDateMs({ iso: "2026-03-02", precision: "day" })).toBe(at("2026-03-02"));
  });

  it("checks that the two dates make sense", () => {
    const now = at("2026-09-28");
    const d = (s: string) => parseLabelDate(s)!;
    expect(labelDatesProblem(d("2026-09"), d("2028-09"), now)).toBeNull();
    expect(labelDatesProblem(d("2026-10-20"), null, now)).toBeNull(); // 한 달 여유
    expect(labelDatesProblem(d("2027-03"), null, now)).toMatch(/제조일자가 미래/);
    expect(labelDatesProblem(d("2026-03"), d("2026-01"), now)).toMatch(/유통기한이 제조일자보다 빨라요/);
    expect(labelDatesProblem(null, d("2045-01"), now)).toMatch(/15년/);
    expect(labelDatesProblem(d("2014-01"), null, now)).toMatch(/10년보다 오래됐어요/); // Sprint 29
    expect(readLabelDates("", "", now)).toEqual({ made: null, expires: null });
    expect(readLabelDates("2026-03", "abc", now)).toEqual({ problem: expect.stringMatching(/유통기한을 읽을 수 없어요/) });
  });
});

describe("production time estimate", () => {
  it("uses the manufacturing date, then expiry minus this product's shelf life, then posting time minus the usual lag", () => {
    const t = productionTimes([
      { post_at: at("2026-06-01"), made: at("2026-01-01"), expires: at("2028-01-01") }, // 유통기한 2년 → 길이 2년
      { post_at: at("2026-07-01"), made: at("2026-02-01") }, // 5개월 뒤에 올림
      { post_at: at("2026-08-01"), expires: at("2028-05-01") }, // → 제조 2026-05 경
      { post_at: at("2026-09-01") }, // 날짜 없음 → 올린 시각 − 간격 중앙값
    ]);
    expect(t.map((x) => x.basis)).toEqual(["made", "made", "expires", "posted"]);
    expect(t[0]!.at).toBe(at("2026-01-01"));
    expect(Math.abs(t[2]!.at - at("2026-05-01"))).toBeLessThan(2 * DAY);
    // 간격: 5개월(1월→6월), 5개월(2월→7월), 약 3개월(5월→8월) → 중앙값 5개월
    expect(Math.abs(t[3]!.at - (at("2026-09-01") - (at("2026-07-01") - at("2026-02-01"))))).toBeLessThan(2 * DAY);
  });

  it("never places a product after its post and keeps the shelf-life estimate near the board default (Sprint 29)", () => {
    // 먼 유통기한 하나로 "가장 새 라벨"이 되지 않게: 추정 제조 시각은 글 올린 시각을 넘지 않는다
    const far = productionTimes([{ post_at: at("2026-06-01"), expires: at("2041-06-01") }], 24);
    expect(far[0]!.at).toBe(at("2026-06-01"));
    // 몇 글의 이상한 두 날짜(14년 차이)가 다른 글의 유통기한 추정을 끌고 가지 않게: 보드 기본값의 두 배까지만
    const skew = productionTimes([
      { post_at: at("2026-06-01"), made: at("2016-07-01"), expires: at("2030-07-01") },
      { post_at: at("2026-06-01"), expires: at("2028-06-01") },
    ], 24);
    expect(Math.abs(skew[1]!.at - (at("2028-06-01") - 48 * 30.44 * DAY))).toBeLessThan(2 * DAY);
  });

  it("falls back to the board's usual shelf life and to posting time when nothing is dated", () => {
    const t = productionTimes([{ post_at: at("2026-06-01"), expires: at("2028-06-01") }, { post_at: at("2026-07-01") }], 24);
    expect(Math.abs(t[0]!.at - at("2026-06-01"))).toBeLessThan(3 * DAY);
    expect(productionTimes([{ post_at: 5 }, { post_at: 9 }])).toEqual([{ at: 5, basis: "posted" }, { at: 9, basis: "posted" }]);
  });
});

describe("dates read from a label photo", () => {
  const base = { readable: true, reason: "", products: [], facts: [], notes: "" };
  it("keeps valid dates and accepts a photo that only shows dates", () => {
    expect(sanitizeRead({ ...base, made_on: "2026.03", expires_on: "2028-03-14" })).toMatchObject({ readable: true, made_on: "2026-03", expires_on: "2028-03-14" });
  });
  it("drops both dates when they do not make sense together, and ignores lot numbers", () => {
    expect(sanitizeRead({ ...base, made_on: "2028-03-14", expires_on: "2026-03" }).readable).toBe(false);
    expect(sanitizeRead({ ...base, products: [{ brand: "NOW", name: "Mag" }], made_on: "LOT2403", expires_on: "" })).toMatchObject({ made_on: "", expires_on: "" });
  });
  it("compares saved dates with what was read", () => {
    const read = { made_on: "2026-03", expires_on: "" };
    expect(sameDatesAsRead(read, parseLabelDate("2026.3"), null)).toBe(true);
    expect(sameDatesAsRead(read, parseLabelDate("2026-03-01"), null)).toBe(false);
    expect(sameDatesAsRead({}, null, null)).toBe(true);
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("renewals ordered by production time (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query, tx } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const posts = await import("@/lib/repo/posts");
  const products = await import("@/lib/repo/products");
  const facts = await import("@/lib/repo/facts");
  const renewals = await import("@/lib/repo/renewals");
  const rules = await import("@/lib/repo/rules");

  let seq = 0;
  async function report(value: number, daysAgo: number, dates: { made?: string; expires?: string } = {}) {
    const n = ++seq;
    const p = await posts.createPost({
      categorySlug: "supplements", nickname: "작성자", pin: "1234",
      title: `NOW 마그네슘 라벨 ${n}`, body: "라벨에 적힌 성분 함량을 정리했습니다.",
      summary: { lines: ["하나", "둘", "셋"], model: "author", isAuthorEdited: true },
      fingerprint: String(n).padStart(64, "0"),
      products: [{ brand: "NOW", name: "Magnesium Citrate", ...dates }],
      facts: [{ product: 0, attribute: "마그네슘", value, unit: "mg", basis: "1정", kind: "label" }],
    });
    await query("UPDATE posts SET created_at = now() - make_interval(days => $2) WHERE id = $1", [p.id, daysAgo]);
    return p.id;
  }
  const productId = async () => (await query<{ id: string }>("SELECT id::text FROM products"))[0]!.id;
  const monthsAgo = (m: number) => {
    const t = new Date(Date.now() - m * 30.44 * DAY);
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
  };

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  beforeEach(async () => {
    await resetRateLimits();
    await query("TRUNCATE posts, products, fingerprints, product_renewals RESTART IDENTITY CASCADE");
    await query("UPDATE renewal_scans SET scanned_until = 'epoch', full_at = 'epoch'");
    rules.invalidateRules();
    facts.clearFactCache();
    seq = 0;
  });
  afterAll(async () => {
    await pool().end();
  });

  // 올린 순서: 200, 200, 150, 150, 200, 200 — 마지막 둘은 오래 둔 옛 재고(제조 1년 전)를 늦게 올린 글
  async function oldStockScenario(withDates: boolean) {
    const dd = (made: string) => (withDates ? { made } : {});
    await report(200, 120, dd(monthsAgo(14)));
    await report(200, 100, dd(monthsAgo(13)));
    await report(150, 30, dd(monthsAgo(2)));
    await report(150, 20, dd(monthsAgo(1)));
    const late1 = await report(200, 10, dd(monthsAgo(12)));
    const late2 = await report(200, 5, withDates ? { expires: monthsAgo(-12) } : {}); // 유통기한만 — 보드 기본 2년 → 제조 약 1년 전
    return [late1, late2];
  }

  it("without dates, late old-stock posts look like the label changed back (Sprint 25 limitation)", async () => {
    await oldStockScenario(false);
    const [g] = await products.productFacts(await productId());
    expect(g!.eras!.map((e) => e.value)).toEqual([200, 150, 200]);
    expect(g!.label).toMatchObject({ median: 200 });
  });

  it("with label dates, orders by production time: finds the renewal and marks late old stock as old", async () => {
    const late = await oldStockScenario(true);
    const [g] = await products.productFacts(await productId());
    expect(g!.eras!.map((e) => e.value)).toEqual([200, 150]);
    expect(g!.eras![0]).toMatchObject({ n: 4 });
    expect(g!.eras![0]!.last_basis).not.toBe("posted");
    expect(g!.eras![1]).toMatchObject({ n: 2, first_basis: "made" });
    expect(g!.label).toMatchObject({ median: 150, n: 2 });
    expect(g!.entries.filter((e) => e.old).map((e) => e.post_id).sort()).toEqual(expect.arrayContaining(late));

    // 정리 배치 기록: 이전 시기 글 목록, 시점 기준 = 라벨 날짜
    await tx((c) => renewals.refreshRenewals(c));
    const [row] = await query<{ status: string; time_basis: string; old_posts: string[] }>("SELECT status, time_basis, old_posts::text[] AS old_posts FROM product_renewals");
    expect(row).toMatchObject({ status: "confirmed", time_basis: "made" });
    expect(row!.old_posts.sort()).toEqual(["1", "2", ...late].sort());

    // 성분 순위: 늦게 올린 옛 재고 글의 200 도 빠져 150
    const cat = (await query<{ id: number }>("SELECT id FROM categories WHERE slug = 'supplements'"))[0]!.id;
    const res = await facts.rankProducts({ categoryId: cat, attrKey: "마그네슘", basisKey: "1정" });
    expect(res!.items.map((i) => [i.value, i.n_label])).toEqual([[150, 2]]);
  });

  it("estimates undated posts from the product's usual posting lag", async () => {
    // 날짜 있는 글: 제조 → 글까지 약 6개월
    await report(200, 400, { made: monthsAgo(19) });
    await report(200, 380, { made: monthsAgo(18) });
    await report(150, 60, { made: monthsAgo(8) });
    // 날짜 없는 150 글 (올린 지 30일) → 추정 제조 약 7개월 전 → 새 시기
    await report(150, 30);
    const [g] = await products.productFacts(await productId());
    expect(g!.eras!.map((e) => e.value)).toEqual([200, 150]);
    expect(g!.eras![1]).toMatchObject({ n: 2, first_basis: "made" });
  });
});
