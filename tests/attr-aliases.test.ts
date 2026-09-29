import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fromBase, IU_MG, normalizeUnit, toBase } from "@/lib/products";

describe("unit rules (Sprint 35)", () => {
  it("converts vitamin D IU to mass (1 µg = 40 IU) but no other IU", () => {
    expect(toBase(1000, "IU", "비타민d")).toEqual({ group: "mass", base: 0.025 }); // mg
    expect(toBase(25, "µg", "비타민d").base).toBeCloseTo(0.025);
    expect(fromBase(0.025, "IU", "비타민d")).toBeCloseTo(1000);
    expect(fromBase(0.025, "µg", "비타민d")).toBeCloseTo(25);
    // 비타민 A·E 는 형태마다 환산값이 달라 바꾸지 않는다
    expect(toBase(1000, "IU", "비타민e")).toEqual({ group: "unit:IU", base: 1000 });
    expect(toBase(1000, "IU")).toEqual({ group: "unit:IU", base: 1000 });
  });

  it("reads Korean unit names", () => {
    expect(["마이크로그램", "밀리그램", "그램", "아이유", "밀리리터"].map(normalizeUnit)).toEqual(["µg", "mg", "g", "IU", "ml"]);
  });

  it("the migration converts exactly the same vitamin D keys as the app", () => {
    const sql = readFileSync(path.join(process.cwd(), "db/migrations/033_attribute_aliases.sql"), "utf8");
    const lists = [...sql.matchAll(/attr_key IN \(([^)]+)\)/g)].map((m) => [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]).sort());
    expect(lists).toHaveLength(2);
    for (const l of lists) expect(l).toEqual(Object.keys(IU_MG).sort());
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("ingredient name aliases (database, Sprint 35)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query, tx } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const posts = await import("@/lib/repo/posts");
  const facts = await import("@/lib/repo/facts");
  const aliases = await import("@/lib/repo/attr-aliases");
  const renewals = await import("@/lib/repo/renewals");
  const corrections = await import("@/lib/repo/corrections");

  let seq = 0;
  async function post(board: string, brand: string, name: string, attribute: string, value: number, unit: string, daysAgo = 10) {
    const n = ++seq;
    const p = await posts.createPost({
      categorySlug: board, nickname: "작성자", pin: "1234", title: `${brand} ${name} 라벨 ${n}`, body: "라벨에 적힌 값을 정리했습니다.",
      summary: { lines: ["하나", "둘", "셋"], model: "author", isAuthorEdited: true },
      fingerprint: String(n).padStart(64, "0"),
      products: [{ brand, name }],
      facts: [{ product: 0, attribute, value, unit, basis: "1정", kind: "label" }],
    });
    await query("UPDATE posts SET created_at = now() - make_interval(days => $2) WHERE id = $1", [p.id, daysAgo]);
    return p;
  }
  const boardId = async (slug: string) => (await query<{ id: number }>("SELECT id FROM categories WHERE slug = $1", [slug]))[0]!.id;
  const keysOf = async (brand: string) =>
    (await query<{ attr_key: string }>("SELECT f.attr_key FROM product_facts f JOIN products pr ON pr.id = f.product_id WHERE pr.brand = $1 ORDER BY f.id", [brand])).map((r) => r.attr_key);
  async function voters(n: number, prefix: string) {
    const out: { fp: string; net: string }[] = [];
    for (let i = 0; i < n; i++) {
      const fp = `${prefix}${i}`.padEnd(64, "v");
      await query("SELECT touch_fingerprint($1, now() - interval '30 days')", [fp]);
      out.push({ fp, net: `${prefix}net${i}` });
    }
    return out;
  }
  let supplements = 0;
  let keyboards = 0;

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
    await resetRateLimits();
    supplements = await boardId("supplements");
    keyboards = await boardId("keyboards");
  });
  afterAll(async () => {
    await pool().end();
  });

  it("files English and Korean names of the same nutrient under one item (built-in dictionary), IU next to µg", async () => {
    await post("supplements", "NOW", "D3 1000", "Vitamin D3", 1000, "IU");
    await post("supplements", "Solgar", "D3 2000", "비타민 D", 50, "mcg");
    await post("supplements", "Thorne", "D3 5000", "콜레칼시페롤", 5000, "IU");
    // 기본 사전은 영양제 보드에만 — 다른 보드의 같은 이름은 그대로
    await post("keyboards", "Iron", "Switch", "Iron", 50, "g");
    expect([...(await keysOf("NOW")), ...(await keysOf("Solgar")), ...(await keysOf("Thorne"))]).toEqual(["비타민d", "비타민d", "비타민d"]);
    expect(await keysOf("Iron")).toEqual(["iron"]);
    // 표시 이름은 쓴 그대로
    expect((await query<{ attribute: string }>("SELECT attribute FROM product_facts ORDER BY id LIMIT 1"))[0]!.attribute).toBe("Vitamin D3");

    facts.clearFactCache();
    const attrs = await facts.listBoardAttributes(supplements);
    const vd = attrs.find((a) => a.attr_key === "비타민d")!;
    expect(vd.products).toBe(3);
    // 이름이 모두 한 번씩이면 대표 키와 같은 이름("비타민 D")을 보여 준다
    expect(vd.attribute).toBe("비타민 D");
    expect(vd.aliases).toEqual(expect.arrayContaining(["vitamind3", "콜레칼시페롤"]));
    // 옛 이름으로 찾아도 같은 항목
    expect(facts.resolveAttribute(attrs, "vitamin d3")?.attr_key).toBe("비타민d");
    expect(facts.resolveAttribute(attrs, "콜레칼시페롤 1000")?.attr_key).toBe("비타민d");

    // IU 와 µg 를 한 순위에서 (가장 많이 쓴 단위 IU 로 표시)
    let r = (await facts.rankProducts({ categoryId: supplements, attrKey: "비타민d" }))!;
    expect(r.unit).toBe("IU");
    expect(r.items.map((x) => [x.brand, Math.round(x.value)])).toEqual([["Thorne", 5000], ["Solgar", 2000], ["NOW", 1000]]);
    r = (await facts.rankProducts({ categoryId: supplements, attrKey: "비타민d", unit: "µg", min: 30 }))!;
    expect(r.unit_mismatch).toBe(false);
    expect(r.items.map((x) => [x.brand, Math.round(x.value)])).toEqual([["Thorne", 125], ["Solgar", 50]]);
    const cats = await query<{ id: number; slug: string; name: string }>("SELECT id, slug, name FROM categories ORDER BY id");
    const { parseFactQuery } = await import("@/lib/fact-query");
    const found = await facts.searchFacts(cats, parseFactQuery("vitamin d3 1500IU 이상")!);
    expect(found.map((b) => [b.category.slug, b.result.items.map((x) => x.brand)])).toEqual([["supplements", ["Thorne", "Solgar"]]]);
  });

  it("community proposal → votes (one per network, not the proposer's network) → operator preview and accept", async () => {
    await post("keyboards", "Gateron", "Yellow", "작동압", 50, "g", 30);
    await post("keyboards", "Gateron", "Red", "작동압", 45, "g", 30);
    await post("keyboards", "Cherry", "Red", "작동력", 45, "g", 30);
    await post("keyboards", "Kailh", "Box", "Actuation Force", 60, "g", 1);
    const ask = (other: string, key = "작동압", fp = "p".repeat(64), net = "proposer-net") =>
      aliases.createProposal({ categoryId: keyboards, attrKey: key, other, reason: "같은 스위치 스펙(누르는 힘)을 다르게 부른 이름입니다.", nickname: "제안자", fingerprint: fp, net });
    await expect(ask("작동 압")).rejects.toMatchObject({ code: "already_same" });
    await expect(ask("없는 항목")).rejects.toMatchObject({ status: 404 });
    // 다른 보드의 항목과는 묶을 수 없다
    await expect(aliases.createProposal({ categoryId: supplements, attrKey: "비타민d", other: "작동력", reason: "다른 보드의 항목과 묶어 보는 시험입니다.", nickname: "x", fingerprint: "q".repeat(64), net: "q" })).rejects.toMatchObject({ status: 404 });
    const p = await ask("작동력");
    expect(p).toMatchObject({ attr_a: "작동력", attr_b: "작동압", status: "open", is_supported: false });
    await expect(ask("작동력", "작동압", "r".repeat(64), "r-net")).rejects.toMatchObject({ code: "proposal_exists" });

    await expect(aliases.voteProposal(p.id, "p2".padEnd(64, "p"), "proposer-net", 1)).rejects.toMatchObject({ status: 403 });
    await expect(aliases.acceptProposal(p.id, "")).rejects.toMatchObject({ code: "not_supported" });
    for (const v of await voters(4, "same")) await aliases.voteProposal(p.id, v.fp, "one-net", 1);
    let r = (await aliases.listProposals(keyboards, "작동압"))[0]!;
    expect(r).toMatchObject({ agree_count: 1, is_supported: false });
    for (const v of await voters(3, "many")) await aliases.voteProposal(p.id, v.fp, v.net, 1);
    r = (await aliases.listProposals(keyboards, "작동력"))[0]!;
    expect(r).toMatchObject({ agree_count: 4, is_supported: true });

    // 미리 보기: 7일 넘은 제품이 많은 "작동압"이 대표, 작동력 수치 1개가 옮겨진다
    expect(await aliases.previewProposal(p.id)).toMatchObject({ canonical: "작동압", alias: "작동력", facts: 1, products: 1, unitGroups: { canonical: ["mass"], alias: ["mass"] } });
    expect((await aliases.previewProposal(p.id, "작동력")).canonical).toBe("작동력");
    expect(await aliases.acceptProposal(p.id, "스펙표 확인")).toEqual({ canonical: "작동압", alias: "작동력", rekeyed: 1 });
    expect(await keysOf("Cherry")).toEqual(["작동압"]);
    expect(await aliases.canonicalAttrKey(keyboards, "작동력")).toBe("작동압");
    facts.clearFactCache();
    const rank = (await facts.rankProducts({ categoryId: keyboards, attrKey: "작동압" }))!;
    // 작동력으로 적힌 Cherry 도 같은 순위에 (Kailh 의 "Actuation Force" 는 제안이 없어 따로)
    expect(rank.items.map((x) => [x.brand, x.name, x.value])).toEqual([["Gateron", "Yellow", 50], ["Gateron", "Red", 45], ["Cherry", "Red", 45]]);

    // 새 글에 옛 이름을 써도 대표 항목으로
    await post("keyboards", "Akko", "Jelly", "작동력", 42, "g");
    expect(await keysOf("Akko")).toEqual(["작동압"]);
    // 공개 기록
    const log = await query<{ action: string; note: string; affected: number }>("SELECT action, note, affected FROM moderation_log ORDER BY id DESC LIMIT 1");
    expect(log[0]).toMatchObject({ action: "attr_alias_accepted", affected: 1 });
    expect(log[0]!.note).toBe("작동력 → 작동압 (수치 1개 · 제품 1개) — 스펙표 확인");
    expect(await aliases.aliasesOf(keyboards, "작동압")).toMatchObject([{ key: "작동력", label: "작동력", builtin: false }]);
  });

  it("carries corrections and confirmed renewals over to the new key (no second notice)", async () => {
    // 옛 값 2명 → 새 값 2명: 확인된 리뉴얼
    for (const [v, days] of [[200, 100], [200, 90], [150, 20], [150, 19]] as const) await post("supplements", "Doctor", "Mag", "Magnesium", v, "mg", days);
    // 대표 키가 아닌 이름("마그네슘 함량")을 쓴 글들 — 먼저 따로 모인다
    for (const [v, days] of [[300, 100], [300, 90], [250, 20], [250, 19]] as const) await post("supplements", "Life", "Mag", "마그네슘 함량", v, "mg", days);
    await tx((c) => renewals.refreshRenewals(c));
    const before = await query<{ attr_key: string; confirmed_at: string }>(
      "SELECT r.attr_key, r.confirmed_at FROM product_renewals r JOIN products pr ON pr.id = r.product_id WHERE pr.brand = 'Life' AND r.status = 'confirmed'",
    );
    expect(before.map((r) => r.attr_key)).toEqual(["마그네슘함량"]);
    // 정정 제안이 걸린 수치
    const target = (await query<{ id: string }>("SELECT p.id::text FROM posts p JOIN post_products pp ON pp.post_id = p.id JOIN products pr ON pr.id = pp.product_id WHERE pr.brand = 'Life' ORDER BY p.id DESC LIMIT 1"))[0]!.id;
    const c = await corrections.createCorrection(target, {
      nickname: "정정러", pin: "5678", target: "fact", factIndex: 0, proposal: "240mg", reason: "라벨 뒷면에 다르게 적혀 있습니다.", fingerprint: "c".repeat(64),
    });

    const p = await aliases.createProposal({ categoryId: supplements, attrKey: "마그네슘", other: "마그네슘 함량", reason: "같은 성분을 다르게 적은 이름입니다.", nickname: "제안자", fingerprint: "s".repeat(64), net: "s-net" });
    for (const v of await voters(4, "mag")) await aliases.voteProposal(p.id, v.fp, v.net, 1);
    expect(await aliases.acceptProposal(p.id, "")).toMatchObject({ canonical: "마그네슘", rekeyed: 4 });

    const after = await query<{ attr_key: string; confirmed_at: string }>(
      "SELECT r.attr_key, r.confirmed_at FROM product_renewals r JOIN products pr ON pr.id = r.product_id WHERE pr.brand = 'Life' AND r.status = 'confirmed'",
    );
    expect(after).toEqual([{ attr_key: "마그네슘", confirmed_at: before[0]!.confirmed_at }]);
    expect((await query<{ fact_attr_key: string }>("SELECT fact_attr_key FROM corrections WHERE id = $1", [c.id]))[0]!.fact_attr_key).toBe("마그네슘");
  });

  it("removing an alias (community or built-in) restores the original keys and is logged", async () => {
    expect(await aliases.removeAlias(keyboards, "작동력", "스위치 제조사마다 기준이 다름")).toEqual({ restored: 2 }); // Cherry, Akko
    expect(await keysOf("Cherry")).toEqual(["작동력"]);
    expect(await keysOf("Gateron")).toEqual(["작동압", "작동압"]);
    // 기본 사전 해제: 비타민 D3 라고 쓴 수치만 되돌아가고, IU 는 다시 따로 (비타민d3 도 IU 환산 대상이라 질량 묶음 유지)
    expect(await aliases.removeAlias(supplements, "vitamind3", "시험")).toEqual({ restored: 1 });
    expect(await keysOf("NOW")).toEqual(["vitamind3"]);
    expect((await query<{ unit_group: string }>("SELECT f.unit_group FROM product_facts f JOIN products pr ON pr.id = f.product_id WHERE pr.brand = 'NOW'"))[0]!.unit_group).toBe("mass");
    const log = await query<{ action: string; subject_id: string; note: string }>("SELECT action, subject_id, note FROM moderation_log ORDER BY id DESC LIMIT 2");
    expect(log.map((l) => l.action)).toEqual(["attr_alias_removed", "attr_alias_removed"]);
    expect(log[0]!.subject_id).toBe(`${supplements}:vitamind3`);
    expect(log[0]!.note).toContain("(기본 사전)");
    await expect(aliases.removeAlias(supplements, "vitamind3", "")).rejects.toMatchObject({ status: 404 });
  });

  it("limits proposals per network and hides abusive reasons", async () => {
    for (const [i, n] of ["A", "B", "C", "D", "E", "F"].entries()) await post("pet-food", "Brand", n, `항목${n}`, 1 + i, "g");
    const pet = await boardId("pet-food");
    const ask = (other: string, i: number) =>
      aliases.createProposal({ categoryId: pet, attrKey: "항목a", other, reason: "같은 성분을 다르게 적은 이름입니다.", nickname: "x", fingerprint: `s${i}`.padEnd(64, "s"), net: "spam-net" });
    for (const [i, o] of ["항목B", "항목C", "항목D", "항목E", "항목F"].entries()) await ask(o, i);
    const extra = await post("pet-food", "Brand", "G", "항목G", 9, "g");
    expect(extra).toBeTruthy();
    await expect(ask("항목G", 9)).rejects.toMatchObject({ status: 429 });
    const [first] = await aliases.listProposals(pet, "항목b");
    await aliases.hideProposalReason(first!.id, "특정인 비방");
    expect((await aliases.listProposals(pet, "항목b"))[0]).toMatchObject({ reason: "", reason_hidden: true });
    await aliases.rejectProposal(first!.id, "성분이 다름");
    await expect(aliases.voteProposal(first!.id, "z".repeat(64), "n", 1)).rejects.toMatchObject({ code: "proposal_closed" });
  });
});
