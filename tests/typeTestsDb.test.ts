import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("🧩 타입 테스트 결과·📚 행사 책 취향 (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const repo = await import("@/lib/repo/typeTests");
  const { TYPE_TESTS } = await import("@/lib/typeTests");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("server re-scores, one result per browser per test, counts by type", async () => {
    const t = TYPE_TESTS["boardgame"]!;
    const all = (i: number) => t.questions.map((q) => Math.min(i, q.options.length - 1));
    const r1 = await repo.saveTypeResult("boardgame", "v1", all(0));
    expect(r1.type).toBe("strategist");
    expect(r1).toMatchObject({ total: 1, same: 1 });
    await repo.saveTypeResult("boardgame", "v2", all(1));
    const r3 = await repo.saveTypeResult("boardgame", "v3", all(0));
    expect(r3).toMatchObject({ type: "strategist", total: 3, same: 2 });
    // 같은 브라우저가 다시 하면 바뀐다 (늘지 않음)
    const again = await repo.saveTypeResult("boardgame", "v1", all(1));
    expect(again).toMatchObject({ type: "party", total: 3, same: 2 });
    expect((await repo.typeDistribution("boardgame")).counts).toEqual({ strategist: 1, party: 2, coop: 0, detective: 0 });
    // 다른 테스트와 섞이지 않는다
    expect((await repo.typeDistribution("cat")).total).toBe(0);
    await expect(repo.saveTypeResult("boardgame", "v4", [0])).rejects.toMatchObject({ status: 400 });
    await expect(repo.saveTypeResult("nope", "v4", [0])).rejects.toMatchObject({ status: 404 });
  });

  it("book tastes: aggregate only, TOP 5 after 5 responses", async () => {
    for (const v of ["a", "b", "c", "d"]) await repo.saveBookTaste(v, ["essay", "poem"]);
    const four = await repo.bookTasteBoard("a");
    expect(four).toMatchObject({ responses: 4, top: [], topics: [], mine: ["essay", "poem"] });
    const five = await repo.saveBookTaste("e", ["sf", "essay", "bogus"]);
    expect(five.responses).toBe(5);
    expect(five.top.slice(0, 2)).toEqual([{ key: "essay", label: "☕ 에세이", count: 5 }, { key: "poem", label: "🌙 시집", count: 4 }]);
    expect(five.topics).toHaveLength(3);
    // 다시 고르면 바뀐다
    await repo.saveBookTaste("e", ["comic"]);
    expect((await repo.bookTasteBoard(null)).top.find((t) => t.key === "sf")).toBeUndefined();
    await expect(repo.saveBookTaste("f", ["bogus"])).rejects.toMatchObject({ status: 400 });
  });
});
