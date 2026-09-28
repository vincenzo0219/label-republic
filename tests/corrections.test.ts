import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { isSupported, squash } from "@/lib/corrections";
import { diffLines, foldDiff } from "@/lib/diff";
import { correctionSchema } from "@/lib/validation";

describe("correction rules", () => {
  it("needs enough agreement, twice the disagreement", () => {
    expect(isSupported(3, 0)).toBe(true);
    expect(isSupported(2.5, 0)).toBe(false); // 새 표(0.5) 섞이면 더 많은 사람이 필요
    expect(isSupported(4, 2)).toBe(true);
    expect(isSupported(4, 2.5)).toBe(false);
    expect(squash("  마그네슘은\n\n 350mg ")).toBe("마그네슘은 350mg");
  });

  it("validates input shape", () => {
    const ok = { nickname: "정정러", pw: "1234", target: "text", quote: "문장", proposal: "고친 문장", reason: "라벨 뒷면을 확인했습니다." };
    expect(correctionSchema.safeParse(ok).success).toBe(true);
    expect(correctionSchema.safeParse({ ...ok, reason: "짧음" }).success).toBe(false);
    expect(correctionSchema.safeParse({ ...ok, target: "vibe" }).success).toBe(false);
    expect(correctionSchema.safeParse({ ...ok, nickname: "운영자" }).success).toBe(false);
  });

  it("diffs lines and folds unchanged runs", () => {
    const d = diffLines("a\nb\nc\nd\ne\nf\ng", "a\nb\nC\nd\ne\nf\ng\nh")!;
    expect(d.filter((l) => l.op !== "same")).toEqual([
      { op: "del", text: "c" },
      { op: "add", text: "C" },
      { op: "add", text: "h" },
    ]);
    const folded = foldDiff(diffLines("1\n2\n3\n4\n5\n6\n7\n8\n9\nx", "1\n2\n3\n4\n5\n6\n7\n8\n9\ny")!, 1);
    expect(folded[0]).toEqual({ op: "skip", count: 8 });
    expect(diffLines("same", "same")!.every((l) => l.op === "same")).toBe(true);
    const big = Array.from({ length: 1000 }, (_, i) => `line ${i}`);
    expect(diffLines(big.join("\n"), big.map((l) => `${l}!`).join("\n"))).toBeNull();
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("corrections (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const posts = await import("@/lib/repo/posts");
  const c = await import("@/lib/repo/corrections");
  const products = await import("@/lib/repo/products");
  const AUTHOR = "a".repeat(64);
  const PROPOSER = "b".repeat(64);
  const voters = ["1", "2", "3", "4", "5", "6"].map((x) => x.repeat(64));

  const newPost = () =>
    posts.createPost({
      categorySlug: "supplements",
      nickname: "작성자",
      pin: "1234",
      title: "마그네슘 함량 정리",
      body: "이 제품은 1정에 마그네슘 350mg이 들어 있습니다.\n하루 한 정이면 충분합니다.",
      summary: { lines: ["하나", "둘", "셋"], model: "author", isAuthorEdited: true },
      fingerprint: AUTHOR,
      products: [{ brand: "NOW", name: "Mag" }],
      facts: [{ product: 0, attribute: "마그네슘", value: 350, unit: "mg", basis: "1정", kind: "label" }],
    });
  const propose = (postId: string, extra: Partial<Parameters<typeof c.createCorrection>[1]> = {}) =>
    c.createCorrection(postId, {
      nickname: "정정러",
      pin: "5678",
      target: "fact",
      factIndex: 0,
      proposal: "1정에 마그네슘 175mg (2정 = 350mg)",
      reason: "라벨 뒷면에 2정 기준 350mg 이라고 적혀 있습니다.",
      fingerprint: PROPOSER,
      ...extra,
    });
  // 오래된 이용자 (갓 생긴 fingerprint 가 아님)
  const seasoned = async (...fps: string[]) => {
    for (const fp of fps) await query("SELECT touch_fingerprint($1, now() - interval '30 days')", [fp]);
  };

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
    products.clearBoardProductsCache();
  });
  afterAll(async () => {
    await pool().end();
  });

  it("snapshots the targeted fact and checks text quotes against the post", async () => {
    const post = await newPost();
    const fact = await propose(post.id);
    expect(fact).toMatchObject({ target: "fact", quote: "NOW Mag · 마그네슘 350 mg (1정) · 표시값", status: "open", target_current: true, is_supported: false });
    const text = await propose(post.id, { target: "text", factIndex: undefined, quote: "1정에 마그네슘   350mg이 들어 있습니다." });
    expect(text.quote).toBe("1정에 마그네슘 350mg이 들어 있습니다.");
    await expect(propose(post.id, { target: "text", quote: "본문에 없는 문장입니다" })).rejects.toMatchObject({ code: "invalid_correction" });
    await expect(propose(post.id, { factIndex: 5 })).rejects.toMatchObject({ code: "invalid_correction" });
    await expect(propose(post.id, { sourceUrl: "https://bit.ly/x" })).rejects.toMatchObject({ code: "invalid_correction" });
    await expect(propose(post.id, { reason: "최저가 구매 링크 카톡 아이디 sale 010-1234-5678 https://shop.example.com" })).rejects.toMatchObject({ code: "invalid_correction" });
    await propose(post.id, { target: "other", quote: "제목" });
    // 한 사람이 한 글에 열어 둘 수 있는 건 3건
    await expect(propose(post.id, { target: "other", quote: "사진" })).rejects.toMatchObject({ status: 429 });
    expect((await posts.getPost(post.id))!).toMatchObject({ correction_count: 3, disputed_count: 0 });
  });

  it("community agreement makes it supported: banner counts, trust badge and product medians follow", async () => {
    const post = await newPost();
    const corr = await propose(post.id);
    await expect(c.voteCorrection(corr.id, PROPOSER, 1)).rejects.toMatchObject({ status: 403 });
    await expect(c.voteCorrection(corr.id, AUTHOR, -1)).rejects.toMatchObject({ status: 403 });
    // 갓 생긴 fingerprint 3명은 1.5점 — 아직 부족
    for (const v of voters.slice(0, 3)) await c.voteCorrection(corr.id, v, 1);
    expect((await c.listCorrections(post.id)).items[0]).toMatchObject({ agree_count: 3, is_supported: false });
    await seasoned(voters[3]!, voters[4]!);
    await c.voteCorrection(corr.id, voters[3]!, 1);
    const r = await c.voteCorrection(corr.id, voters[4]!, 1);
    expect(r).toMatchObject({ agree_count: 5, is_supported: true, my_vote: 1 });
    expect((await posts.getPost(post.id))!.disputed_count).toBe(1);
    // 같은 표를 다시 누르면 취소
    expect(await c.voteCorrection(corr.id, voters[4]!, 1)).toMatchObject({ agree_count: 4, my_vote: 0, is_supported: false });
    await c.voteCorrection(corr.id, voters[4]!, 1);

    // 제품 집계에서 빠진다
    const [g] = await products.productFacts(post.products[0]!.id);
    expect(g).toMatchObject({ label: null, disputed_n: 1 });
    expect(g!.entries[0]!.disputed).toBe(true);

    // 신뢰도 상위 배지 대상에서 빠진다
    await query("UPDATE posts SET created_at = now() - interval '2 days', upvotes = 10 WHERE id = $1", [post.id]);
    await query("SELECT refresh_trust_tiers(1, 3)");
    expect((await posts.getPost(post.id))!.trust_tier).toBe("none");
  });

  it("author can only mark applied after actually editing; answering keeps the dispute", async () => {
    const post = await newPost();
    const corr = await propose(post.id);
    await seasoned(voters[0]!, voters[1]!, voters[2]!);
    for (const v of voters.slice(0, 3)) await c.voteCorrection(corr.id, v, 1);
    await expect(c.respondCorrection(corr.id, AUTHOR, "1234", "applied", "")).rejects.toMatchObject({ code: "not_edited" });
    await expect(c.respondCorrection(corr.id, AUTHOR, "0000", "answered", "아닙니다")).rejects.toMatchObject({ status: 403 });
    await expect(c.respondCorrection(corr.id, AUTHOR, "1234", "answered", "")).rejects.toMatchObject({ code: "invalid_correction" });
    const answered = await c.respondCorrection(corr.id, AUTHOR, "1234", "answered", "제 제품은 1정 350mg 입니다");
    expect(answered).toMatchObject({ status: "answered", author_note: "제 제품은 1정 350mg 입니다" });
    expect((await posts.getPost(post.id))!.disputed_count).toBe(1);

    // 제목만 고치면 수치가 그대로라 반영 불가
    await posts.updatePost(post.id, AUTHOR, "1234", { title: "마그네슘 함량 정리 (수정)" });
    await expect(c.respondCorrection(corr.id, AUTHOR, "1234", "applied", "")).rejects.toMatchObject({ code: "not_edited" });
    // 수치를 고치면 반영 가능
    await posts.updatePost(post.id, AUTHOR, "1234", {
      facts: [{ product: 0, attribute: "마그네슘", value: 175, unit: "mg", basis: "1정", kind: "label" }],
    });
    const applied = await c.respondCorrection(corr.id, AUTHOR, "1234", "applied", "라벨 다시 보니 맞네요");
    expect(applied).toMatchObject({ status: "applied", target_current: false });
    expect((await posts.getPost(post.id))!).toMatchObject({ disputed_count: 0, revision_count: 2 });
    await expect(c.voteCorrection(corr.id, voters[3]!, 1)).rejects.toMatchObject({ status: 409 });

    // 수정 이력: 최신 판부터, 이전 수치가 남아 있다
    const revs = await posts.listRevisions(post.id);
    expect(revs.map((r) => r.title)).toEqual(["마그네슘 함량 정리 (수정)", "마그네슘 함량 정리"]);
    expect(revs[0]!.facts).toEqual([{ product_id: "1", product: "NOW Mag", attribute: "마그네슘", value: 350, unit: "mg", basis: "1정", kind: "label" }]);
    // 아무것도 안 바뀐 수정은 이력을 남기지 않는다
    await posts.updatePost(post.id, AUTHOR, "1234", {});
    expect((await posts.getPost(post.id))!.revision_count).toBe(2);
  });

  it("text corrections become stale when the sentence is edited", async () => {
    const post = await newPost();
    const corr = await propose(post.id, { target: "text", quote: "하루 한 정이면 충분합니다." });
    await posts.updatePost(post.id, AUTHOR, "1234", { body: "이 제품은 1정에 마그네슘 350mg이 들어 있습니다.\n하루 두 정을 나눠 드세요." });
    expect((await c.listCorrections(post.id)).items[0]!.target_current).toBe(false);
    expect(await c.respondCorrection(corr.id, AUTHOR, "1234", "applied", "")).toMatchObject({ status: "applied" });
  });

  it("proposer can withdraw; five unique reports hide a correction", async () => {
    const post = await newPost();
    const a = await propose(post.id);
    await expect(c.withdrawCorrection(a.id, PROPOSER, "1111")).rejects.toMatchObject({ status: 403 });
    expect(await c.withdrawCorrection(a.id, PROPOSER, "5678")).toMatchObject({ status: "withdrawn" });
    const b = await propose(post.id, { target: "other", quote: "제목" });
    // 신고 가중치: 오래된 이용자 1, 갓 생긴 이용자 0.5 (Sprint 18) — 여기서는 오래된 이용자 5명
    await seasoned(...voters.slice(0, 5));
    for (const v of voters.slice(0, 4)) await c.reportCorrection(b.id, v);
    expect(await c.reportCorrection(b.id, voters[0]!)).toMatchObject({ alreadyReported: true, is_hidden: false });
    expect(await c.reportCorrection(b.id, voters[4]!)).toMatchObject({ report_count: 5, is_hidden: true });
    const list = await c.listCorrections(post.id);
    expect(list.items.map((x) => x.status)).toEqual(["withdrawn"]);
    expect(list.hidden).toBe(1);
    expect((await posts.getPost(post.id))!.correction_count).toBe(0);
    // 블라인드 글에는 정정 제안도 보이지 않고, 새로 달 수 없다
    await query("UPDATE posts SET is_blinded = true WHERE id = $1", [post.id]);
    expect((await c.listCorrections(post.id)).items).toEqual([]);
    await expect(propose(post.id, { target: "other", quote: "제목" })).rejects.toMatchObject({ status: 410 });
  });
});
