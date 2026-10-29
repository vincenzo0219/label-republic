import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { QUICK_REPLY_DEFAULT, isQuickReply, quickRepliesFor, showQuickReplies } from "@/lib/quickReplies";

describe("🙌 한 번 누르는 답장 (10/29)", () => {
  it("사람 글이고 내 글이 아니고 아직 댓글을 안 달았을 때만", () => {
    expect(showQuickReplies({ human: true, mine: false, commented: false })).toBe(true);
    expect(showQuickReplies({ human: false, mine: false, commented: false })).toBe(false);
    expect(showQuickReplies({ human: true, mine: true, commented: false })).toBe(false);
    expect(showQuickReplies({ human: true, mine: false, commented: true })).toBe(false);
  });
  it("방마다 버튼 말이 다르고, 없으면 기본", () => {
    expect(quickRepliesFor("테니스-덕후방")).toContain("저 갈게요");
    expect(quickRepliesFor("neo")).toEqual(expect.arrayContaining(["🛒 사라!", "💳 참아!"]));
    expect(quickRepliesFor("미혼남녀-만남-행사")).toContain("저도 솔로예요");
    expect(quickRepliesFor("없는방")).toEqual(QUICK_REPLY_DEFAULT);
    expect(quickRepliesFor(null)).toEqual(QUICK_REPLY_DEFAULT);
    expect(isQuickReply(" 저도요! ", "주식")).toBe(true);
    for (const list of [QUICK_REPLY_DEFAULT, ...Object.values({ a: quickRepliesFor("neo"), b: quickRepliesFor("tennis") })]) {
      expect(list.length).toBeGreaterThanOrEqual(3);
      expect(list.length).toBeLessThanOrEqual(4);
      for (const t of list) expect(t).not.toMatch(/—|카톡/);
    }
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("🙌 첫 환영 배지·버튼 답장 수 (DB)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { createComment, listComments } = await import("@/lib/repo/comments");
  const { quickReplyContext, quickReplyStats } = await import("@/lib/repo/quickReply");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  const fpA = "a".repeat(64);
  const fpB = "b".repeat(64);
  const fpC = "c".repeat(64);
  const post = async (cat: number, nick: string, fp: string | null) =>
    (await query<{ id: string }>("INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type, author_fingerprint) VALUES ($1, $2, 'x', 't', 'b', 'chat', $3) RETURNING id::text", [cat, nick, fp]))[0]!.id;

  it("처음 온 사람의 첫 글에 사람이 단 첫 댓글만 환영러, 운영자·글쓴이 자신은 빼고", async () => {
    const [cat] = await query<{ id: number }>("INSERT INTO categories (slug, name, description) VALUES ('qr', 'qr', '') RETURNING id");
    const first = await post(cat!.id, "새내기", fpA);
    // 글쓴이 자신의 댓글은 첫 댓글로 치지 않는다
    const self = await createComment(first, { nickname: "새내기", pin: "1234", body: "안녕하세요", fingerprint: fpA });
    expect(self.welcomer).toBeFalsy();
    // 운영 닉네임은 환영러가 안 된다
    await createComment(first, { nickname: "노방장", pin: "1234", body: "반가워요", fingerprint: fpC });
    const c1 = await createComment(first, { nickname: "반가운이", pin: "1234", body: "🙌 환영해요", fingerprint: fpB, chip: true });
    expect(c1.welcomer).toBe(true);
    // 두 번째로 단 사람은 아니다
    const c2 = await createComment(first, { nickname: "두번째", pin: "1234", body: "저도요!", fingerprint: "d".repeat(64) });
    expect(c2.welcomer).toBeFalsy();
    // 같은 사람의 두 번째 글은 처음 온 사람의 첫 글이 아니다
    const second = await post(cat!.id, "새내기", fpA);
    const c3 = await createComment(second, { nickname: "세번째", pin: "1234", body: "반가워요", fingerprint: "e".repeat(64) });
    expect(c3.welcomer).toBeFalsy();
    // 목록에서는 환영러 닉네임의 다른 댓글에도 배지
    const later = await createComment(second, { nickname: "반가운이", pin: "1234", body: "또 왔네요", fingerprint: fpB });
    const list = await listComments(second);
    expect(list.find((c) => String(c.id) === String(later.id))?.welcomer).toBe(true);
    expect(await quickReplyStats()).toMatchObject({ chips: 1, welcomes: 1, welcomers: 1 });
  });

  it("사람 글·내 글 판단: 운영 닉네임·지문 없는 글은 사람 글이 아니다", async () => {
    const [cat] = await query<{ id: number }>("INSERT INTO categories (slug, name, description) VALUES ('qr2', 'qr2', '') RETURNING id");
    const human = await post(cat!.id, "사람", fpA);
    const op = await post(cat!.id, "노방장", null);
    expect(await quickReplyContext(human, fpB)).toMatchObject({ human: true, mine: false, slug: "qr2" });
    expect(await quickReplyContext(human, fpA)).toMatchObject({ human: true, mine: true });
    expect((await quickReplyContext(op, fpB)).human).toBe(false);
  });
});
