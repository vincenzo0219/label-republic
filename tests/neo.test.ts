import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { neoTextProblem } from "@/lib/repo/neo";

// 💳 넣어둬 (10/27): 살까 말까 익명 투표, AI 판결 없음
describe("넣어둬 글 규칙", () => {
  it("링크·연락처·욕설은 받지 않는다", () => {
    expect(neoTextProblem("무선 이어폰", "지금 거 멀쩡함")).toBeNull();
    expect(neoTextProblem("이어폰", "https://shop.example.com/x")).toMatch(/링크/);
    expect(neoTextProblem("이어폰", "010-1234-5678 연락")).toMatch(/연락처/);
    expect(neoTextProblem("이어폰", "카톡 주세요")).toMatch(/연락처/);
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("💳 넣어둬 (DB)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const neo = await import("@/lib/repo/neo");
  const route = await import("@/app/api/neo/route");
  const dir = path.join(process.cwd(), "db", "migrations");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
    await resetRateLimits();
  }, 120_000);
  afterAll(async () => {
    await pool().end();
  });

  it("올리고 투표하면 내 표 뒤에만 결과가 보이고, 글쓴이는 투표하지 않는다", async () => {
    const it0 = await neo.createNeo({ title: "무선 이어폰", price: 239000, reason: "지금 거 멀쩡함", owner: "own", fingerprint: "fp1" });
    expect(it0).toMatchObject({ owner: true, tally: { buy: 0, keep: 0 }, closed: false });
    expect((await neo.getNeo(it0.id, "v1"))!.tally).toBeNull();
    expect(await neo.voteNeo(it0.id, "v1", "keep")).toMatchObject({ mine: "keep", tally: { buy: 0, keep: 1 } });
    await neo.voteNeo(it0.id, "v2", "buy");
    // 마음 바꾸기
    expect(await neo.voteNeo(it0.id, "v2", "keep")).toMatchObject({ tally: { buy: 0, keep: 2 } });
    await expect(neo.voteNeo(it0.id, "own", "buy")).rejects.toMatchObject({ status: 403 });
    await expect(neo.setNeoOutcome(it0.id, "own", "bought")).rejects.toMatchObject({ status: 409 });
    // 투표 중 "안 살래요": 바로 마감하고 넣어둔 것으로
    const quit = await neo.createNeo({ title: "게임기", price: 400000, reason: "", alt: "중고로", owner: "own", fingerprint: "fp1" });
    expect(quit.alt).toBe("중고로");
    expect(await neo.setNeoOutcome(quit.id, "own", "kept")).toMatchObject({ outcome: "kept", closed: true });
    expect(await neo.neoSaved()).toEqual({ won: 400000, count: 1 });
    await query("DELETE FROM neo_items WHERE id = $1", [quit.id]);
  });

  it("24시간 뒤 마감, 넣어뒀어요를 고르면 지킨 돈에 쌓인다", async () => {
    const it1 = await neo.createNeo({ title: "패딩", price: 189000, reason: "", owner: "own2", fingerprint: "fp2" });
    await query("UPDATE neo_items SET closes_at = now() - interval '1 minute' WHERE id = $1", [it1.id]);
    const seen = await neo.getNeo(it1.id, "v9");
    expect(seen).toMatchObject({ closed: true, tally: { buy: 0, keep: 0 } });
    await expect(neo.voteNeo(it1.id, "v9", "buy")).rejects.toMatchObject({ status: 409 });
    await expect(neo.setNeoOutcome(it1.id, "someone", "kept")).rejects.toMatchObject({ status: 404 });
    expect(await neo.setNeoOutcome(it1.id, "own2", "kept")).toMatchObject({ outcome: "kept" });
    expect(await neo.neoSaved()).toEqual({ won: 189000, count: 1 });
    const list = await neo.listNeo("v9");
    expect(list.closed.map((x) => x.title)).toContain("패딩");
    expect(list.open.map((x) => x.title)).toContain("무선 이어폰");
  });

  it("신고 3번이면 가리고, 하루 5개까지", async () => {
    const it2 = await neo.createNeo({ title: "가릴 글", price: 5000, reason: "", owner: "own3", fingerprint: "fp3" });
    await neo.reportNeo(it2.id, "r1");
    await neo.reportNeo(it2.id, "r1");
    await neo.reportNeo(it2.id, "r2");
    expect(await neo.reportNeo(it2.id, "r3")).toEqual({ hidden: true });
    expect(await neo.getNeo(it2.id, "r1")).toBeNull();
    for (let i = 0; i < 4; i++) await neo.createNeo({ title: `물건 ${i}`, price: 1000, reason: "", owner: "own3", fingerprint: "fp3" });
    await expect(neo.createNeo({ title: "여섯 번째", price: 1000, reason: "", owner: "own3", fingerprint: "fp3" })).rejects.toMatchObject({ status: 429 });
  });

  it("API: 가격·이름 검사, 방문자 쿠키를 붙인다", async () => {
    const req = (body: unknown) =>
      new Request("http://localhost/api/neo", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.77" }, body: JSON.stringify(body) });
    const ctx = { params: Promise.resolve({}) };
    expect((await route.POST(req({ title: "키보드", price: 500 }), ctx)).status).toBe(400);
    const ok = await route.POST(req({ title: "키보드", price: 129000, reason: "축 바꾸고 싶음" }), ctx);
    expect(ok.status).toBe(201);
    expect(ok.headers.get("set-cookie")).toMatch(/lr_vid=/);
    const body = (await ok.json()) as { item: { owner: boolean; tally: unknown } };
    expect(body.item).toMatchObject({ owner: true, tally: { buy: 0, keep: 0 } });
  });
});
