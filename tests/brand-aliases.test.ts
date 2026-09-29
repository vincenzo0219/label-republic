import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("brand aliases (database, Sprint 31)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const posts = await import("@/lib/repo/posts");
  const aliases = await import("@/lib/repo/brand-aliases");
  const { brandHistory } = await import("@/lib/repo/renewal-feed");
  const { searchProducts } = await import("@/lib/repo/products");

  let seq = 0;
  async function post(brand: string, name: string) {
    const n = ++seq;
    const p = await posts.createPost({
      categorySlug: "supplements", nickname: "작성자", pin: "1234", title: `${brand} ${name} 후기 ${n}`, body: "라벨에 적힌 값을 정리했습니다.",
      summary: { lines: ["하나", "둘", "셋"], model: "author", isAuthorEdited: true }, fingerprint: String(n).padStart(64, "0"),
      products: [{ brand, name }],
    });
    return p;
  }
  const pid = async (brand: string, name: string) =>
    (await query<{ id: string }>("SELECT id::text FROM products WHERE brand = $1 AND name = $2", [brand, name]))[0]!.id;
  /** 서로 다른 망의 오래된 이용자 n명 */
  async function voters(n: number, prefix: string) {
    const out: { fp: string; net: string }[] = [];
    for (let i = 0; i < n; i++) {
      const fp = `${prefix}${i}`.padEnd(64, "v");
      await query("SELECT touch_fingerprint($1, now() - interval '30 days')", [fp]);
      out.push({ fp, net: `${prefix}net${i}` });
    }
    return out;
  }
  const ask = (other: string, fp = "p".repeat(64), net = "proposer-net", brandKey = "nowfoods") =>
    aliases.createProposal({ brandKey, other, reason: "한국 수입 표기이고 라벨의 제조사가 같습니다.", nickname: "제안자", fingerprint: fp, net });

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
    await resetRateLimits();
    await post("NOW Foods", "Magnesium Citrate");
    await post("NOW Foods", "Magnesium Citrate");
    await post("NOW Foods", "Zinc");
    await post("나우푸드", "Magnesium Citrate");
    await post("나우푸드", "Vitamin C");
    await post("Solgar", "Vitamin D3");
  });
  afterAll(async () => {
    await pool().end();
  });

  it("validates proposals: brands must exist and differ, one open proposal per pair", async () => {
    await expect(ask("NOW  foods")).rejects.toMatchObject({ status: 409, code: "already_same" });
    await expect(ask("없는브랜드")).rejects.toMatchObject({ status: 404 });
    const p = await ask("나우푸드");
    // 키는 정렬해 저장 (순서 없는 쌍), 표기는 가장 많이 쓴 것
    expect(p).toMatchObject({ brand_a: "nowfoods", brand_b: "나우푸드", label_a: "NOW Foods", label_b: "나우푸드", status: "open", is_supported: false });
    await expect(ask("나우 푸드", "q".repeat(64), "other-net")).rejects.toMatchObject({ status: 409, code: "proposal_exists" });
    expect((await aliases.listProposals("나우푸드")).map((x) => x.id)).toEqual([p.id]);
  });

  it("counts one vote per network and needs community support before the operator can accept", async () => {
    const [p] = await aliases.listProposals("nowfoods");
    await expect(aliases.voteProposal(p!.id, "p".repeat(64), "x", 1)).rejects.toMatchObject({ status: 403 });
    await expect(aliases.acceptProposal(p!.id, "")).rejects.toMatchObject({ status: 409, code: "not_supported" });
    // 같은 망에서 4명(브라우저만 바꿈)이 동의해도 한 명
    const sameNet = await voters(4, "same");
    for (const v of sameNet) await aliases.voteProposal(p!.id, v.fp, "one-net", 1);
    let r = await aliases.voteProposal(p!.id, sameNet[0]!.fp, "one-net", 1); // 다시 누르면 취소
    expect(r).toMatchObject({ agree_count: 1, my_vote: 0, is_supported: false });
    const many = await voters(3, "many");
    for (const v of many) r = await aliases.voteProposal(p!.id, v.fp, v.net, 1);
    expect(r).toMatchObject({ agree_count: 4, is_supported: true });
    // 반대가 많아지면 동의가 풀린다 (반대의 2배 이상 필요)
    const against = await voters(3, "against");
    for (const v of against) r = await aliases.voteProposal(p!.id, v.fp, v.net, -1);
    expect(r).toMatchObject({ disagree_count: 3, is_supported: false });
    for (const v of against) r = await aliases.voteProposal(p!.id, v.fp, v.net, -1);
    expect(r.is_supported).toBe(true);
  });

  it("accepting merges same-name products, rekeys the rest, and later tags use the canonical brand", async () => {
    const [p] = await aliases.listProposals("nowfoods");
    const mag = await pid("NOW Foods", "Magnesium Citrate");
    const oldMag = await pid("나우푸드", "Magnesium Citrate");
    const vitc = await pid("나우푸드", "Vitamin C");
    // 제품 수가 같으면 먼저 생긴 쪽이 대표
    const res = await aliases.acceptProposal(p!.id, "수입사 확인");
    expect(res).toEqual({ canonical: "nowfoods", alias: "나우푸드", merged: 1, rekeyed: 1 });
    expect((await query<{ merged_into: string }>("SELECT merged_into::text FROM products WHERE id = $1", [oldMag]))[0]!.merged_into).toBe(mag);
    expect(await aliases.canonicalBrandKey("나우푸드")).toBe("nowfoods");

    // 브랜드 페이지는 한 곳에: 제품 3개 (Magnesium 글 3개)
    const h = (await brandHistory("nowfoods"))!;
    expect(h.products.map((x) => [x.name, x.post_count]).sort()).toEqual([["Magnesium Citrate", 3], ["Vitamin C", 1], ["Zinc", 1]]);
    expect(await brandHistory("나우푸드")).toBeNull();
    expect(await aliases.aliasesOf("nowfoods")).toMatchObject([{ key: "나우푸드", label: "나우푸드" }]);

    // 새 글에 옛 표기로 태그해도 대표 브랜드 제품으로
    const again = await post("나우푸드", "Vitamin C");
    expect(again.products[0]!.id).toBe(vitc);
    const iron = await post("나우 푸드", "Iron");
    expect((await query<{ norm_key: string }>("SELECT norm_key FROM products WHERE id = $1", [iron.products[0]!.id]))[0]!.norm_key).toBe("nowfoods|iron");
    // 옛 표기로 검색해도 찾는다
    expect((await searchProducts("나우푸드 vitamin")).map((x) => x.id)).toEqual([vitc]);

    // 공개 기록: 별칭 확정 + 제품 병합
    const log = await query<{ action: string; note: string }>("SELECT action, note FROM moderation_log ORDER BY id");
    expect(log.map((l) => l.action)).toEqual(["product_merged", "brand_alias_accepted"]);
    expect(log[1]!.note).toBe("나우푸드 → NOW Foods (제품 병합 1 · 합친 제품 1) — 수입사 확인");

    // 이미 같은 브랜드면 새 제안 불가, 별칭 쪽 키로 제안해도 대표 키로 비교
    await expect(ask("NOW Foods", "r".repeat(64), "net-r", "나우푸드")).rejects.toMatchObject({ code: "already_same" });
    const solgar = await ask("Solgar", "r".repeat(64), "net-r", "나우푸드");
    expect(solgar).toMatchObject({ brand_a: "nowfoods", brand_b: "solgar" });
    await aliases.rejectProposal(solgar.id, "제조사가 다릅니다");
    await expect(aliases.voteProposal(solgar.id, "z".repeat(64), "n", 1)).rejects.toMatchObject({ code: "proposal_closed" });
  });

  it("removing an alias restores keys of rekeyed products (merges stay) and is logged", async () => {
    const { restored } = await aliases.removeAlias("나우푸드", "잘못 확정");
    expect(restored).toBe(2); // Vitamin C, Iron
    expect(await aliases.canonicalBrandKey("나우푸드")).toBe("나우푸드");
    expect((await brandHistory("나우푸드"))!.products.map((x) => x.name).sort()).toEqual(["Iron", "Vitamin C"]);
    const last = (await query<{ action: string; note: string }>("SELECT action, note FROM moderation_log ORDER BY id DESC LIMIT 1"))[0]!;
    expect(last.action).toBe("brand_alias_removed");
    expect(last.note).toContain("확정 때 병합된 제품 1개는 그대로");
  });

  it("limits proposals per person and per network", async () => {
    await query("DELETE FROM brand_alias_proposals WHERE status = 'open'");
    await post("Brand A", "x");
    await post("Brand B", "x");
    await post("Brand C", "x");
    await post("Brand D", "x");
    await post("Brand E", "x");
    await post("Brand F", "x");
    const others = ["Brand A", "Brand B", "Brand C", "Brand D", "Brand E"];
    // 식별값만 바꿔도 같은 망이면 하루 5건
    for (const [i, o] of others.entries()) await ask(o, `s${i}`.padEnd(64, "s"), "spam-net", "solgar");
    await expect(ask("Brand F", "s9".padEnd(64, "s"), "spam-net", "solgar")).rejects.toMatchObject({ status: 429 });
  });
});
