import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanPath, describeAgent } from "@/lib/feedback";

describe("feedback helpers (Sprint 36)", () => {
  it("keeps only a same-site path of the page the user was on", () => {
    expect(cleanPath("/posts/12?q=비밀#c3")).toBe("/posts/12");
    expect(cleanPath("https://labelrep.kr/c/supplements/facts?attr=x")).toBe("/c/supplements/facts");
    expect(cleanPath("//evil.example/x")).toBe("");
    expect(cleanPath("javascript:alert(1)")).toBe("");
    expect(cleanPath("/feedback?from=/x")).toBe("");
    expect(cleanPath("/admin/moderation")).toBe("");
    expect(cleanPath(undefined)).toBe("");
  });

  it("describes the browser and OS without sending the full user agent", () => {
    expect(describeAgent("Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36"))
      .toEqual({ browser: "삼성 인터넷 25", os: "Android 14" });
    expect(describeAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"))
      .toEqual({ browser: "Safari 17", os: "iOS 17" });
    expect(describeAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"))
      .toEqual({ browser: "Chrome 140", os: "Windows" });
    expect(describeAgent("curl/8")).toEqual({ browser: "알 수 없음", os: "알 수 없음" });
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("feedback (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const fb = await import("@/lib/repo/feedback");
  const { verifiedFeedbackIds, verifiedCommentIds } = await import("@/lib/comment-token");
  const { runMaintenance } = await import("@/lib/jobs/maintenance");

  const send = (over: Partial<Parameters<typeof fb.createFeedback>[0]> = {}) =>
    fb.createFeedback({
      kind: "bug", title: "비교 표가 잘려요", body: "휴대폰에서 제품 비교 표의 오른쪽이 잘려 보이지 않습니다.",
      pagePath: "/compare", env: { browser: "Chrome 140", os: "Android 14", viewport: "390×844", online: true }, fingerprint: "a".repeat(64), net: "net-a", ...over,
    });

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("stores a report, returns a browser-only ref, and shows only public fields on the board", async () => {
    const { id, ref } = await send({ env: { browser: "Chrome 140", os: "Android 14", viewport: "390x844<script>" } as never });
    expect(verifiedFeedbackIds([ref], 10)).toEqual([id]);
    // 증표는 제보 전용 — 번호만·다른 종류의 증표로는 안 됨
    expect(verifiedFeedbackIds([`${id}.${"x".repeat(16)}`, id], 10)).toEqual([]);
    expect(verifiedCommentIds([ref], 10)).toEqual([]);
    const row = (await query<{ env: Record<string, unknown> }>("SELECT env FROM feedback WHERE id = $1", [id]))[0]!;
    expect(row.env).toMatchObject({ browser: "Chrome 140", os: "Android 14" });
    expect(row.env).not.toHaveProperty("viewport"); // 형식이 틀린 화면 크기는 버림

    const { items, total } = await fb.listPublic("open");
    expect(total).toBe(1);
    expect(items[0]).toMatchObject({ id, title: "비교 표가 잘려요", page_path: "/compare", status: "new", metoo_count: 0 });
    expect(items[0]).not.toHaveProperty("body");
    expect(items[0]).not.toHaveProperty("env");
    const mine = await fb.listMine([id]);
    expect(mine[0]).toMatchObject({ body: expect.stringContaining("휴대폰"), real_title: "비교 표가 잘려요" });
  });

  it("rejects ads and limits one network per day", async () => {
    await expect(send({ title: "최저가 구매 링크", body: "카톡 문의 주세요 010-1234-5678 https://shop.example.com 할인코드 SALE 지금 구매 최저가 무료배송" }))
      .rejects.toMatchObject({ status: 400, code: "looks_like_spam" });
    await query("DELETE FROM feedback");
    for (let i = 0; i < fb.MAX_PER_NETWORK_PER_DAY; i++) await send({ fingerprint: String(i).padStart(64, "f"), net: "busy-net" });
    await expect(send({ fingerprint: "z".repeat(64), net: "busy-net" })).rejects.toMatchObject({ status: 429 });
    await query("DELETE FROM feedback");
  });

  it("counts 'me too' once per network, not from the reporter, and only while open", async () => {
    const { id } = await send();
    await expect(fb.toggleMetoo(id, "a".repeat(64), "other")).rejects.toMatchObject({ status: 403 });
    await expect(fb.toggleMetoo(id, "b".repeat(64), "net-a")).rejects.toMatchObject({ status: 403 }); // 제보자와 같은 망
    expect(await fb.toggleMetoo(id, "c".repeat(64), "net-c")).toEqual({ metoo_count: 1, my_metoo: true });
    expect(await fb.toggleMetoo(id, "d".repeat(64), "net-c")).toEqual({ metoo_count: 1, my_metoo: true }); // 같은 망은 한 사람
    expect(await fb.toggleMetoo(id, "e".repeat(64), "net-e")).toEqual({ metoo_count: 2, my_metoo: true });
    expect(await fb.toggleMetoo(id, "e".repeat(64), "net-e")).toEqual({ metoo_count: 1, my_metoo: false }); // 다시 누르면 취소
    expect((await fb.listPublic("open", 1, "c".repeat(64))).items[0]!.my_metoo).toBe(true);

    await fb.updateFeedback(id, { status: "done", note: "표를 가로로 넘겨 볼 수 있게 고쳤습니다." });
    await expect(fb.toggleMetoo(id, "f".repeat(64), "net-f")).rejects.toMatchObject({ status: 409 });
    expect((await fb.listPublic("closed")).items[0]).toMatchObject({ id, status: "done", public_note: "표를 가로로 넘겨 볼 수 있게 고쳤습니다." });
    expect((await fb.listPublic("open")).items.map((x) => x.id)).not.toContain(id);
  });

  it("operator: hide needs a public reason and hides the title; duplicates move 'me too' to the original", async () => {
    const spam = await send({ title: "아무개 전화번호 공개합니다", fingerprint: "s".repeat(64), net: "net-s" });
    await expect(fb.updateFeedback(spam.id, { status: "hidden", note: "" })).rejects.toMatchObject({ code: "note_required" });
    await fb.updateFeedback(spam.id, { status: "hidden", note: "개인정보가 있어 가렸습니다." });
    const hidden = (await fb.listPublic("all")).items.find((x) => x.id === spam.id)!;
    expect(hidden).toMatchObject({ title: "", page_path: "", status: "hidden", public_note: "개인정보가 있어 가렸습니다." });
    await expect(fb.toggleMetoo(spam.id, "q".repeat(64), "q")).rejects.toMatchObject({ status: 404 });
    await expect(fb.updateFeedback(spam.id, { status: "wontfix", note: " " })).rejects.toMatchObject({ code: "note_required" });

    const original = await send({ title: "검색이 느려요", fingerprint: "o".repeat(64), net: "net-o" });
    const copy = await send({ title: "검색 느림", fingerprint: "p".repeat(64), net: "net-p" });
    await fb.toggleMetoo(copy.id, "m".repeat(64), "net-m");
    await expect(fb.updateFeedback(copy.id, { status: "duplicate", note: "", duplicateOf: copy.id })).rejects.toMatchObject({ code: "invalid_duplicate" });
    await expect(fb.updateFeedback(copy.id, { status: "duplicate", note: "", duplicateOf: spam.id })).rejects.toMatchObject({ code: "invalid_duplicate" });
    await fb.updateFeedback(copy.id, { status: "duplicate", note: "#원래 제보에서 처리합니다", duplicateOf: original.id });
    // 중복 제보의 "나도"와 그 제보자도 원래 제보의 "나도"로
    expect((await fb.listMine([original.id]))[0]!.metoo_count).toBe(2);
    expect((await fb.listMine([copy.id]))[0]).toMatchObject({ status: "duplicate", duplicate_of: original.id });
    // 중복의 중복은 원래 제보로 펴 둔다
    const third = await send({ title: "검색 결과가 늦게 떠요", fingerprint: "t".repeat(64), net: "net-t" });
    await fb.updateFeedback(third.id, { status: "duplicate", note: "", duplicateOf: copy.id });
    expect((await fb.listMine([third.id]))[0]!.duplicate_of).toBe(original.id);
    expect(await fb.countNew()).toMatchObject({ new: 1, open: 1 });
    expect((await fb.listForAdmin("hidden"))[0]).toMatchObject({ real_title: "아무개 전화번호 공개합니다", page_path: "/compare" });
  });

  it("maintenance forgets reporter identity after 30 days and the details after a year", async () => {
    const { id } = await send({ fingerprint: "r".repeat(64), net: "net-r" });
    await fb.toggleMetoo(id, "v".repeat(64), "net-v");
    await fb.updateFeedback(id, { status: "done", note: "" });
    await query("UPDATE feedback SET resolved_at = now() - interval '40 days' WHERE id = $1", [id]);
    await runMaintenance();
    let row = (await query<{ reporter_fingerprint: string | null; reporter_net: string | null; body: string }>("SELECT reporter_fingerprint, reporter_net, body FROM feedback WHERE id = $1", [id]))[0]!;
    expect(row).toMatchObject({ reporter_fingerprint: null, reporter_net: null });
    expect(row.body).not.toBe("");
    expect((await query<{ voter_net: string | null }>("SELECT voter_net FROM feedback_votes WHERE feedback_id = $1", [id]))[0]!.voter_net).toBeNull();
    await query("UPDATE feedback SET resolved_at = now() - interval '400 days' WHERE id = $1", [id]);
    await runMaintenance();
    row = (await query<{ reporter_fingerprint: string | null; reporter_net: string | null; body: string }>("SELECT reporter_fingerprint, reporter_net, body FROM feedback WHERE id = $1", [id]))[0]!;
    expect(row.body).toBe("");
    expect((await fb.listPublic("closed")).items.find((x) => x.id === id)).toMatchObject({ title: "비교 표가 잘려요", status: "done" });
  });
});
