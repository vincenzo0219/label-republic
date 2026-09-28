import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { numParam, parseFactQuery } from "@/lib/fact-query";
import { normText, toBase } from "@/lib/products";

describe("fact query parsing", () => {
  const cases: [string, Partial<ReturnType<typeof parseFactQuery>> | null][] = [
    ["마그네슘 200mg 이상", { attribute: "마그네슘", min: 200, unit: "mg", approx: false, label: "마그네슘 200 mg 이상" }],
    ["200mg 이상 마그네슘", { attribute: "마그네슘", min: 200, unit: "mg" }],
    ["아연 함량 10mg 이하", { attribute: "아연", max: 10, unit: "mg" }],
    ["칼슘 500mg 미만", { attribute: "칼슘", max: 500 }],
    ["비타민D 1000~2000IU", { attribute: "비타민D", min: 1000, max: 2000, unit: "IU" }],
    ["오메가3 500~1000mg", { attribute: "오메가3", min: 500, max: 1000, unit: "mg" }],
    ["스프링 무게 ≥ 60g", { attribute: "스프링 무게", min: 60, unit: "g" }],
    ["비타민 B12 500mcg 이상", { attribute: "비타민 B12", min: 500, unit: "µg" }],
    ["철분 18 mg 이상 제품", { attribute: "철분", min: 18, unit: "mg" }],
    ["D3 5000", { attribute: "D3", min: 4500, max: 5500, approx: true, unit: undefined }],
    ["마그네슘200mg", { attribute: "마그네슘", approx: true, unit: "mg" }],
    ["마그네슘 비스글리시네이트", null],
    ["200mg 이상", null], // 항목 이름 없음
    ["마그네슘 200<b> 이상", null], // 단위로 볼 수 없는 글자
  ];
  it.each(cases)("%s", (q, want) => {
    const got = parseFactQuery(q);
    if (want === null) expect(got).toBeNull();
    else expect(got).toMatchObject(want);
  });

  it("treats empty numeric params as no condition", () => {
    expect(numParam("")).toBeUndefined();
    expect(numParam("  ")).toBeUndefined();
    expect(numParam(undefined)).toBeUndefined();
    expect(numParam("0")).toBe(0);
    expect(numParam("12,5")).toBe(12.5);
    expect(numParam("-1")).toBeUndefined();
    expect(numParam("abc")).toBeUndefined();
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("fact search (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const posts = await import("@/lib/repo/posts");
  const facts = await import("@/lib/repo/facts");
  const corrections = await import("@/lib/repo/corrections");
  const products = await import("@/lib/repo/products");

  type F = { attribute: string; value: number; unit: string; basis?: string; kind: "label" | "measured" };
  let n = 0;
  const post = (brand: string, name: string, fs: F[], fp = "f".repeat(64)) =>
    posts.createPost({
      categorySlug: "supplements",
      nickname: "작성자",
      pin: "1234",
      title: `${brand} ${name} 성분 정리 ${++n}`,
      body: "라벨에 적힌 성분 함량을 정리했습니다.",
      summary: { lines: ["하나", "둘", "셋"], model: "author", isAuthorEdited: true },
      fingerprint: fp,
      products: [{ brand, name }],
      facts: fs.map((f) => ({ product: 0, basis: "1정", ...f })),
    });

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      await query(readFileSync(path.join(dir, f), "utf8"));
    }
  });
  beforeEach(async () => {
    await resetRateLimits();
    await query("TRUNCATE posts, products, fingerprints RESTART IDENTITY CASCADE");
    facts.clearFactCache();
    products.clearBoardProductsCache();
  });
  afterAll(async () => {
    await pool().end();
  });

  it("migration backfill matches the app's comparison keys", async () => {
    // 016 까지의 스키마에 넣은 것처럼 비교용 칸을 비운 뒤, 017 의 채우기 식으로 다시 계산해 앱 계산과 비교
    const units = ["µg", "mg", "g", "kg", "ml", "L", "mm", "cm", "Hz", "kHz", "IU", "%", "kcal", "정"];
    const bases = ["1정", "1 정", "1일 섭취량", "100g", "(캡슐 2개)", "Ｄ3·기준", ""];
    const p = await post("Test", "Backfill", units.map((u, i) => ({ attribute: `항목${i}`, value: 1.5, unit: u, basis: bases[i % bases.length], kind: "label" as const })));
    await query("UPDATE product_facts SET basis_key = '', unit_group = '', base_value = 0 WHERE post_id = $1", [p.id]);
    const mig = readFileSync(path.join(process.cwd(), "db/migrations/017_fact_search.sql"), "utf8");
    await query(/UPDATE product_facts SET[\s\S]*?;/.exec(mig)![0]);
    const rows = await query<{ unit: string; basis: string; basis_key: string; unit_group: string; base_value: number }>(
      "SELECT unit, basis, basis_key, unit_group, base_value FROM product_facts WHERE post_id = $1",
      [p.id],
    );
    for (const r of rows) {
      const want = toBase(1.5, r.unit);
      expect([r.unit, r.basis_key, r.unit_group, r.base_value]).toEqual([r.unit, normText(r.basis), want.group, expect.closeTo(want.base, 9)]);
    }
  });

  it("ranks products by median value within attribute, basis and unit group", async () => {
    await post("A", "Mag", [{ attribute: "마그네슘", value: 200, unit: "mg", kind: "label" }, { attribute: "마그네슘", value: 170, unit: "mg", kind: "measured" }]);
    await post("A", "Mag", [{ attribute: "마그네슘", value: 0.2, unit: "g", kind: "label" }]);
    await post("B", "Mag", [{ attribute: "마그네슘", value: 350, unit: "mg", kind: "label" }]);
    await post("C", "Mag", [{ attribute: "마그네슘", value: 100000, unit: "µg", kind: "label" }]);
    await post("D", "Mag", [{ attribute: "마그네슘", value: 400, unit: "mg", basis: "2정", kind: "label" }]); // 기준이 다름
    await post("E", "D", [{ attribute: "비타민 D", value: 1000, unit: "IU", kind: "label" }]);
    const spam = await post("F", "Mag", [{ attribute: "마그네슘", value: 999, unit: "mg", kind: "label" }]);
    await query("UPDATE posts SET is_suppressed = true WHERE id = $1", [spam.id]);

    const attrs = await facts.listBoardAttributes(1);
    expect(attrs.map((a) => [a.attr_key, a.products, a.bases.map((b) => b.basis)])).toEqual([
      ["마그네슘", 3, ["1정", "2정"]],
      ["비타민d", 1, ["1정"]],
    ]);

    let r = (await facts.rankProducts({ categoryId: 1, attrKey: "마그네슘" }))!;
    expect(r).toMatchObject({ basis: "1정", unit: "mg", kind: "label", total: 3 });
    expect(r.items.map((x) => [x.brand, x.value, x.measured, x.posts])).toEqual([
      ["B", 350, null, 1],
      ["A", 200, 170, 2],
      ["C", 100, null, 1],
    ]);
    expect(r.items[1]!.diff_pct).toBeCloseTo(-15);

    // 범위·단위·정렬
    r = (await facts.rankProducts({ categoryId: 1, attrKey: "마그네슘", min: 0.15, unit: "g", order: "asc" }))!;
    expect(r.items.map((x) => [x.brand, x.value])).toEqual([["A", 0.2], ["B", 0.35]]);
    // 실측값 기준
    r = (await facts.rankProducts({ categoryId: 1, attrKey: "마그네슘", kind: "measured" }))!;
    expect(r.items.map((x) => x.brand)).toEqual(["A"]);
    // 다른 기준
    r = (await facts.rankProducts({ categoryId: 1, attrKey: "마그네슘", basisKey: "2정" }))!;
    expect(r.items.map((x) => x.brand)).toEqual(["D"]);
    // 바꿔 계산할 수 없는 단위
    r = (await facts.rankProducts({ categoryId: 1, attrKey: "비타민d", unit: "µg", min: 10 }))!;
    expect(r).toMatchObject({ unit_mismatch: true, items: [] });
    // 표시값이 없으면 실측값으로
    await post("G", "Zinc", [{ attribute: "아연", value: 12, unit: "mg", kind: "measured" }]);
    facts.clearFactCache();
    expect(await facts.rankProducts({ categoryId: 1, attrKey: "아연" })).toMatchObject({ kind: "measured", kind_fallback: true, total: 1 });
    expect(await facts.rankProducts({ categoryId: 1, attrKey: "없는항목" })).toBeNull();
  });

  it("resolves attribute names from search text and searches across boards", async () => {
    await post("A", "Mag", [{ attribute: "마그네슘", value: 200, unit: "mg", kind: "label" }]);
    await post("B", "Mag", [{ attribute: "마그네슘", value: 350, unit: "mg", kind: "label" }]);
    await post("V", "D", [{ attribute: "비타민D", value: 1000, unit: "IU", kind: "label" }]);
    const attrs = await facts.listBoardAttributes(1);
    expect(facts.resolveAttribute(attrs, "마그네슘")?.attr_key).toBe("마그네슘");
    expect(facts.resolveAttribute(attrs, "마그네슘 1정")?.attr_key).toBe("마그네슘");
    expect(facts.resolveAttribute(attrs, "비타민")?.attr_key).toBe("비타민d");
    expect(facts.resolveAttribute(attrs, "칼슘")).toBeNull();

    const cats = await query<{ id: number; slug: string; name: string }>("SELECT id, slug, name FROM categories ORDER BY id");
    const found = await facts.searchFacts(cats, parseFactQuery("마그네슘 300mg 이상")!);
    expect(found.map((b) => [b.category.slug, b.result.items.map((x) => x.brand)])).toEqual([["supplements", ["B"]]]);
    const below = await facts.searchFacts(cats, parseFactQuery("마그네슘 300mg 이하")!);
    expect(below[0]!.result.items.map((x) => x.brand)).toEqual(["A"]); // 이하 조건은 적은 순
    expect(await facts.searchFacts(cats, parseFactQuery("칼슘 300mg 이상")!)).toEqual([]);
  });

  it("drops values under a supported correction, like product pages", async () => {
    const p = await post("A", "Mag", [{ attribute: "마그네슘", value: 350, unit: "mg", kind: "label" }], "a".repeat(64));
    await post("B", "Mag", [{ attribute: "마그네슘", value: 200, unit: "mg", kind: "label" }]);
    const c = await corrections.createCorrection(p.id, {
      nickname: "정정러", pin: "5678", target: "fact", factIndex: 0, proposal: "175mg", reason: "라벨 뒷면에 2정 기준으로 적혀 있습니다.", fingerprint: "b".repeat(64),
    });
    for (const v of ["1", "2", "3"]) {
      await query("SELECT touch_fingerprint($1, now() - interval '30 days')", [v.repeat(64)]);
      await corrections.voteCorrection(c.id, v.repeat(64), 1);
    }
    const r = (await facts.rankProducts({ categoryId: 1, attrKey: "마그네슘" }))!;
    expect(r.items.map((x) => x.brand)).toEqual(["B"]);
  });
});
