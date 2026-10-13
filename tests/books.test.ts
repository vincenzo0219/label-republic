import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BOOK_MIN_FOR_RATE, bookKey, completionRate, normText } from "@/lib/books";
import { bookCreateSchema, bookReadSchema } from "@/lib/books-schema";

describe("book cards — pure (Sprint 62)", () => {
  it("treats spacing, punctuation and width as the same book", () => {
    expect(normText("미움받을 용기")).toBe(normText("미움받을용기!"));
    expect(bookKey("미움받을 용기", "기시미 이치로")).toBe(bookKey(" 미움받을  용기 ", "기시미이치로"));
    expect(bookKey("데미안", "헤세")).not.toBe(bookKey("데미안", ""));
  });

  it("shows a completion rate only once enough finished/dropped records exist", () => {
    expect(BOOK_MIN_FOR_RATE).toBe(3);
    expect(completionRate(2, 0)).toBeNull();
    expect(completionRate(2, 1)).toBe(67);
    expect(completionRate(0, 3)).toBe(0);
  });

  it("validates input and snaps progress", () => {
    expect(bookReadSchema.parse({ status: "done", progress: 30, nickname: "돈키호테" }).progress).toBe(100);
    expect(bookReadSchema.parse({ status: "reading", progress: 47, nickname: "돈키호테" }).progress).toBe(45);
    expect(() => bookReadSchema.parse({ status: "finished", nickname: "돈키호테" })).toThrow();
    expect(() => bookReadSchema.parse({ status: "reading", progress: 101, nickname: "돈키호테" })).toThrow();
    expect(() => bookReadSchema.parse({ status: "reading", nickname: "a" })).toThrow();
    expect(() => bookReadSchema.parse({ status: "reading", nickname: "돈키호테", line: "가".repeat(201) })).toThrow();
    expect(() => bookCreateSchema.parse({ title: "  " })).toThrow();
    expect(bookCreateSchema.parse({ title: "데미안" }).author).toBe("");
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("book cards (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const books = await import("@/lib/repo/books");
  const fp = (s: string) => s.padStart(64, "b");

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("creates a card once per title+author and rejects abusive titles", async () => {
    const a = await books.createBook("미움받을 용기", "기시미 이치로", fp("x"));
    expect(a.created).toBe(true);
    const again = await books.createBook("미움받을용기", "기시미이치로", fp("y"));
    expect(again).toEqual({ id: a.id, created: false });
    await expect(books.createBook("병신 같은 책", "", fp("x"))).rejects.toThrow();
    expect((await books.listBooks()).map((b) => b.title)).toEqual(["미움받을 용기"]);
  });

  it("keeps one record per reader, computes rate, drop point and next books", async () => {
    const { id } = await books.createBook("데미안", "헤르만 헤세", null);
    const next = await books.createBook("수레바퀴 아래서", "헤르만 헤세", null);
    expect((await books.saveBookRead(id, fp("a"), { status: "reading", progress: 40, line: "", nextTitle: "", nickname: "독자1" })).created).toBe(true);
    // 같은 사람이 다시 남기면 고쳐진다
    expect((await books.saveBookRead(id, fp("a"), { status: "done", progress: 100, line: "좋았어요", nextTitle: "수레바퀴 아래서", nickname: "독자1" })).created).toBe(false);
    await books.saveBookRead(id, fp("b"), { status: "dropped", progress: 30, line: "", nextTitle: "수레바퀴아래서", nickname: "독자2" });
    await books.saveBookRead(id, fp("c"), { status: "dropped", progress: 50, line: "연락 010-1234-5678", nextTitle: "", nickname: "독자3" });
    await books.saveBookRead(id, fp("d"), { status: "reading", progress: 10, line: "시발 어렵네", nextTitle: "", nickname: "독자4" });

    const b = (await books.getBook(id, fp("c")))!;
    expect([b.reading, b.done, b.dropped]).toEqual([1, 1, 2]);
    expect(b.rate).toBe(33);
    expect(b.dropAt).toBe(40);
    expect(b.nextBooks).toEqual([{ title: expect.stringMatching(/수레바퀴/), count: 2, bookId: next.id }]);
    const mine = b.reads.filter((r) => r.mine);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.line).toBe("연락 [개인정보 가림]");
    const rude = b.reads.find((r) => r.nickname === "독자4")!;
    expect(rude.hidden).toBe(true);
    expect(rude.line).toBe("");
    expect((await books.listBooks())[0]!.id).toBe(id); // 최근 기록 순
  });

  it("rejects reserved nicknames and unknown books, and counts readers as participants", async () => {
    const { id } = await books.createBook("데미안", "헤르만 헤세", null);
    await expect(books.saveBookRead(id, fp("e"), { status: "done", progress: 100, line: "", nextTitle: "", nickname: "노방장 운영자" })).rejects.toThrow();
    await expect(books.saveBookRead("999999", fp("e"), { status: "done", progress: 100, line: "", nextTitle: "", nickname: "독자5" })).rejects.toThrow();
    expect(await books.getBook("abc", null)).toBeNull();
    const n = await query<{ n: number }>("SELECT count(*)::int AS n FROM fingerprints WHERE fingerprint = $1", [fp("a")]);
    expect(n[0]!.n).toBe(1);
  });
});
