import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("📖 오늘 책 한입 (Sprint 96)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { setBite, todayBite, tryBite } = await import("@/lib/repo/bookBites");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("shows today's card and counts each person once", async () => {
    const now = new Date("2026-10-22T00:30:00Z"); // KST 10/22 09:30
    expect(await todayBite(now)).toBeNull();
    expect(await tryBite("a".repeat(64), now)).toBeNull(); // 카드 없는 날은 누를 수 없다
    await setBite({ day: "2026-10-22", book: "책", author: "저자", quote: "한 문장", verbatim: true, action: "하나 해 보기" });
    expect(await tryBite("a".repeat(64), now)).toBe(1);
    expect(await tryBite("a".repeat(64), now)).toBe(1);
    expect(await tryBite("b".repeat(64), now)).toBe(2);
    expect(await todayBite(now)).toMatchObject({ day: "2026-10-22", book: "책", tries: 2 });
    expect(await todayBite(new Date("2026-10-22T15:30:00Z"))).toBeNull(); // 다음 날(KST 10/23)은 새 카드
  });
});
