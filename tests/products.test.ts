import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fromBase, median, normalizeUnit, productKey, productNameProblem, toBase, validUnit } from "@/lib/products";
import { aggregateFacts, type Product } from "@/lib/repo/products";
import { factsSchema, productRefsSchema } from "@/lib/validation";

describe("product rules", () => {
  it("treats spelling variants of the same product as one key", () => {
    expect(productKey("NOW Foods", "Magnesium Glycinate 200mg")).toBe(productKey("now foods", "magnesium-glycinate  200 MG"));
    expect(productKey("나우푸드", "마그네슘 200mg")).toBe(productKey("나우 푸드", "마그네슘200mg"));
    // 전각 문자도 같은 키
    expect(productKey("ＮＯＷ", "Ｍａｇ")).toBe(productKey("NOW", "Mag"));
    expect(productKey("NOW", "Mag 200")).not.toBe(productKey("NOW", "Mag 400"));
  });

  it("rejects ad-like product names", () => {
    expect(productNameProblem("", "이름")).toMatch(/모두 입력/);
    expect(productNameProblem("브랜드", "최저가 www.shop.com")).toMatch(/링크/);
    expect(productNameProblem("브랜드", "구매문의 010-1234-5678")).toMatch(/연락처/);
    expect(productNameProblem("브랜드", "카톡 문의")).toMatch(/연락처/);
    expect(productNameProblem("---", "!!!")).toMatch(/글자나 숫자/);
    expect(productNameProblem("나우푸드", "마그네슘 비스글리시네이트 200mg")).toBeNull();
  });

  it("normalizes units and converts within unit groups", () => {
    expect(normalizeUnit("mcg")).toBe("µg");
    expect(normalizeUnit("μg")).toBe("µg"); // 그리스 문자 뮤
    expect(normalizeUnit("㎎")).toBe("mg");
    expect(normalizeUnit("iu")).toBe("IU");
    expect(normalizeUnit(" g ")).toBe("g");
    expect(normalizeUnit("gf")).toBe("gf");
    expect(validUnit("mg")).toBe(true);
    expect(validUnit("정")).toBe(true);
    expect(validUnit("<b>")).toBe(false);
    expect(validUnit("")).toBe(false);
    expect(toBase(500, "µg")).toEqual({ group: "mass", base: 0.5 });
    expect(fromBase(toBase(0.2, "g").base, "mg")).toBeCloseTo(200);
    expect(toBase(400, "IU")).toEqual({ group: "unit:IU", base: 400 });
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });

  it("aggregates facts per attribute, basis and unit group", () => {
    const row = (post_id: string, attribute: string, value: number, unit: string, kind: "label" | "measured", basis = "1정") => ({
      product_id: "1", post_id, attribute, attr_key: attribute.toLowerCase().replace(/\s/g, ""), value, unit, basis, kind,
    });
    const groups = aggregateFacts([
      row("1", "마그네슘", 200, "mg", "label"),
      row("2", "마그네슘", 200, "mg", "label"),
      row("3", "마그네슘", 0.17, "g", "measured"),
      row("4", "마그네슘", 180, "mg", "measured"),
      row("5", "마그네슘", 400, "mg", "label", "1일 섭취량"), // 기준이 다르면 다른 줄
      row("6", "비타민 D", 1000, "IU", "label"),
      row("7", "비타민D", 25, "µg", "label"), // IU 와 µg 는 바꿔 계산하지 않는다
    ]);
    const mg = groups.find((g) => g.attribute === "마그네슘" && g.basis === "1정")!;
    expect(mg.unit).toBe("mg");
    expect(mg.label).toEqual({ median: 200, n: 2 });
    expect(mg.measured!.n).toBe(2);
    expect(mg.measured!.median).toBeCloseTo(175);
    expect(mg.diff_pct).toBeCloseTo(-12.5);
    expect(mg.entries).toHaveLength(4);
    expect(groups.find((g) => g.basis === "1일 섭취량")!.label).toEqual({ median: 400, n: 1 });
    expect(groups.filter((g) => g.attribute.startsWith("비타민"))).toHaveLength(2);
  });

  it("validates product and fact input shapes", () => {
    expect(productRefsSchema.safeParse([{ id: "1" }, { brand: "A", name: "B" }]).success).toBe(true);
    expect(productRefsSchema.safeParse([{ id: "x" }]).success).toBe(false);
    expect(productRefsSchema.safeParse([{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }]).success).toBe(false);
    const fact = { product: 0, attribute: "마그네슘", value: 200, unit: "mg", kind: "label" };
    expect(factsSchema.parse([fact])[0]!.basis).toBe("");
    expect(factsSchema.safeParse([{ ...fact, value: -1 }]).success).toBe(false);
    expect(factsSchema.safeParse([{ ...fact, value: "200" }]).success).toBe(false);
    expect(factsSchema.safeParse([{ ...fact, kind: "guess" }]).success).toBe(false);
    expect(factsSchema.safeParse(Array(21).fill(fact)).success).toBe(false);
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("products (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const posts = await import("@/lib/repo/posts");
  const products = await import("@/lib/repo/products");
  const { mergeProduct, listDuplicateProductCandidates } = await import("@/lib/repo/operator");
  const { moderationLog } = await import("@/lib/repo/legal");
  const FP = "f".repeat(64);

  const newPost = (input: Partial<Parameters<typeof posts.createPost>[0]> = {}, title = "마그네슘 함량 실측") =>
    posts.createPost({
      categorySlug: "supplements",
      nickname: "테스터",
      pin: "1234",
      title,
      body: "마그네슘 함량을 직접 재 보았습니다.",
      summary: { lines: ["하나", "둘", "셋"], model: "author", isAuthorEdited: true },
      fingerprint: FP,
      ...input,
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
    await query("TRUNCATE posts, products, moderation_log RESTART IDENTITY CASCADE");
    products.clearBoardProductsCache();
  });
  afterAll(async () => {
    await pool().end();
  });

  it("creates products on first tag and reuses them for spelling variants", async () => {
    const a = await newPost({
      products: [{ brand: "NOW Foods", name: "Magnesium Glycinate 200mg" }],
      facts: [
        { product: 0, attribute: "마그네슘", value: 200, unit: "mg", basis: "1정", kind: "label" },
        { product: 0, attribute: " 마그네슘 ", value: 176.5, unit: "㎎", basis: "1정", kind: "measured" },
      ],
    });
    expect(a.products).toEqual([{ id: "1", brand: "NOW Foods", name: "Magnesium Glycinate 200mg" }]);
    expect(a.facts).toEqual([
      { product_id: "1", attribute: "마그네슘", value: 200, unit: "mg", basis: "1정", kind: "label", image: null, origin: "manual" },
      { product_id: "1", attribute: "마그네슘", value: 176.5, unit: "mg", basis: "1정", kind: "measured", image: null, origin: "manual" },
    ]);
    const b = await newPost({ products: [{ brand: "now foods", name: "magnesium glycinate 200 MG" }] }, "두 번째 글");
    expect(b.products[0]!.id).toBe("1");
    // 다른 보드에서는 같은 이름이라도 다른 제품
    const c = await newPost({ categorySlug: "keyboards", products: [{ brand: "NOW Foods", name: "Magnesium Glycinate 200mg" }] }, "다른 보드");
    expect(c.products[0]!.id).toBe("2");
    // 다른 보드 제품을 id 로 태그할 수는 없다
    await expect(newPost({ products: [{ id: "2" }] })).rejects.toMatchObject({ status: 400, code: "invalid_product" });

    // 카드에도 제품이 붙는다
    const feed = await posts.listPosts({ sort: "latest", categoryId: 1 });
    expect(feed.items.find((p) => p.id === a.id)!.products).toHaveLength(1);
    expect((await posts.listPosts({ sort: "latest", productId: "1" })).items.map((p) => p.title).sort()).toEqual(["두 번째 글", "마그네슘 함량 실측"]);
  });

  it("rejects bad products and facts and rolls back the whole post", async () => {
    await expect(newPost({ products: [{ brand: "광고", name: "구매 010-1234-5678" }] })).rejects.toMatchObject({ code: "invalid_product" });
    await expect(
      newPost({ products: [{ brand: "A", name: "B" }], facts: [{ product: 1, attribute: "x", value: 1, unit: "mg", kind: "label" }] }),
    ).rejects.toMatchObject({ code: "invalid_product" });
    await expect(
      newPost({ products: [{ brand: "A", name: "B" }], facts: [{ product: 0, attribute: "x", value: 1, unit: "<script>", kind: "label" }] }),
    ).rejects.toMatchObject({ code: "invalid_product" });
    await expect(newPost({ facts: [{ product: 0, attribute: "x", value: 1, unit: "mg", kind: "label" }] })).rejects.toMatchObject({ code: "invalid_product" });
    expect((await query("SELECT count(*)::int AS n FROM posts"))[0]).toEqual({ n: 0 });
    expect((await query("SELECT count(*)::int AS n FROM products"))[0]).toEqual({ n: 0 });
  });

  it("edits: final-state products and facts, untouched when omitted, hidden when blinded", async () => {
    const post = await newPost({
      products: [{ brand: "A", name: "One" }, { brand: "B", name: "Two" }],
      facts: [
        { product: 0, attribute: "철", value: 10, unit: "mg", kind: "label" },
        { product: 1, attribute: "철", value: 20, unit: "mg", kind: "label" },
      ],
    });
    // 제품 하나를 빼면 그 제품의 수치도 빠진다
    let edited = await posts.updatePost(post.id, FP, "1234", { products: [{ id: post.products[1]!.id }] });
    expect(edited.products.map((p) => p.name)).toEqual(["Two"]);
    expect(edited.facts.map((f) => f.value)).toEqual([20]);
    // 수치만 바꾸면 현재 태그 순서 기준
    edited = await posts.updatePost(post.id, FP, "1234", { facts: [{ product: 0, attribute: "아연", value: 5, unit: "mg", kind: "measured" }] });
    expect(edited.facts).toEqual([{ product_id: post.products[1]!.id, attribute: "아연", value: 5, unit: "mg", basis: "", kind: "measured", image: null, origin: "manual" }]);
    // 보내지 않으면 그대로
    edited = await posts.updatePost(post.id, FP, "1234", { title: "제목만 수정" });
    expect(edited.products).toHaveLength(1);
    expect(edited.facts).toHaveLength(1);
    await query("UPDATE posts SET is_blinded = true WHERE id = $1", [post.id]);
    expect(await posts.getPost(post.id)).toMatchObject({ products: [], facts: [] });
  });

  it("product pages collect only visible posts and aggregate their facts", async () => {
    const tag = [{ brand: "NOW", name: "Mag 200" }];
    await newPost({ products: tag, facts: [{ product: 0, attribute: "마그네슘", value: 200, unit: "mg", basis: "1정", kind: "label" }] }, "라벨 글");
    await newPost({ products: tag, facts: [{ product: 0, attribute: "마그네슘", value: 0.16, unit: "g", basis: "1정", kind: "measured" }] }, "실측 글");
    const hidden = await newPost({ products: tag, facts: [{ product: 0, attribute: "마그네슘", value: 999, unit: "mg", basis: "1정", kind: "measured" }] }, "광고 글");
    await query("UPDATE posts SET is_suppressed = true WHERE id = $1", [hidden.id]);

    const product = await products.getProduct("1");
    expect(product).toMatchObject({ id: "1", brand: "NOW", name: "Mag 200", post_count: 2, category: { slug: "supplements" } });
    const [mg] = await products.productFacts("1");
    expect(mg).toMatchObject({ attribute: "마그네슘", unit: "mg", label: { median: 200, n: 1 }, measured: { median: 160, n: 1 } });
    expect(mg!.diff_pct).toBeCloseTo(-20);
    expect((await products.searchProducts("now mag")).map((p) => [p.id, p.post_count])).toEqual([["1", 2]]);
    expect(await products.searchProducts("nowmag200")).toHaveLength(1); // 띄어쓰기 없이도
    expect(await products.searchProducts("200 now")).toHaveLength(1); // 단어 순서와 무관 (AND)
    expect(await products.searchProducts("now 400")).toHaveLength(0);
    expect(await products.searchProducts("없는제품")).toEqual([]);

    // 광고 의심 글에만 태그된 제품은 페이지·검색에 없다
    const spam = await newPost({ products: [{ brand: "Spam", name: "Pills" }] }, "스팸 글");
    await query("UPDATE posts SET is_suppressed = true WHERE id = $1", [spam.id]);
    expect(await products.getProduct(spam.products[0]!.id)).toBeNull();
    expect(await products.searchProducts("spam")).toEqual([]);
    expect((await products.listBoardProducts(1)).items.map((p) => p.id)).toEqual(["1"]);
    expect((await products.listProductIdsForSitemap()).map((p) => p.id)).toEqual(["1"]);
  });

  it("compares products on the same attribute rows with unit conversion", async () => {
    const a = await newPost({ products: [{ brand: "A", name: "Mag" }], facts: [{ product: 0, attribute: "마그네슘", value: 200, unit: "mg", basis: "1정", kind: "label" }] });
    const b = await newPost({
      products: [{ brand: "B", name: "Mag" }],
      facts: [
        { product: 0, attribute: "마그네슘", value: 0.1, unit: "g", basis: "1정", kind: "label" },
        { product: 0, attribute: "아연", value: 5, unit: "mg", basis: "1정", kind: "label" },
      ],
    });
    const list = await Promise.all([a, b].map((p) => products.getProduct(p.products[0]!.id)));
    const rows = await products.compareProducts(list as Product[]);
    expect(rows.map((r) => [r.attribute, r.unit, r.cells.map((c) => c?.label ?? null)])).toEqual([
      ["마그네슘", "mg", [200, 100]],
      ["아연", "mg", [null, 5]],
    ]);
  });

  it("operators merge duplicate products publicly; old ids redirect", async () => {
    const one = await newPost({ products: [{ brand: "나우푸드", name: "마그네슘 200" }], facts: [{ product: 0, attribute: "마그네슘", value: 200, unit: "mg", kind: "label" }] });
    const two = await newPost({ products: [{ brand: "나우푸드", name: "마그네슘 200정" }] }, "다른 표기");
    const both = await newPost({ products: [{ id: one.products[0]!.id }, { id: two.products[0]!.id }] }, "둘 다 태그");
    const [pair] = await listDuplicateProductCandidates();
    expect(pair).toMatchObject({ a_id: "1", b_id: "2" });

    expect(await mergeProduct("1", "2", "")).toEqual({ moved: 1 }); // 둘 다 태그한 글은 한 번만
    expect(await products.getProduct("1")).toEqual({ redirect: "2" });
    expect(await products.getProduct("2")).toMatchObject({ post_count: 3 });
    expect((await products.productFacts("2"))[0]!.label).toEqual({ median: 200, n: 1 });
    expect((await posts.getPost(both.id))!.products.map((p) => p.id)).toEqual(["2"]);
    // 옛 id 로 태그해도 합쳐진 제품으로
    expect((await newPost({ products: [{ id: "1" }] }, "옛 번호")).products[0]!.id).toBe("2");
    // 같은 이름으로 다시 적어도 합쳐진 제품으로
    expect((await newPost({ products: [{ brand: "나우 푸드", name: "마그네슘200" }] }, "옛 이름")).products[0]!.id).toBe("2");
    const [log] = await moderationLog(10);
    expect(log).toMatchObject({ action: "product_merged", subject_type: "product", subject_id: "1", affected: 1 });
    await expect(mergeProduct("1", "2", "")).rejects.toMatchObject({ status: 409 });
    await expect(mergeProduct("2", "2", "")).rejects.toMatchObject({ status: 400 });
    void two;
  });
});
