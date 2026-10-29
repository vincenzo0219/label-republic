import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { trollCheck } from "@/lib/troll";

// 🧹 올린 직후 바로 가릴 조롱·도배 (10/29 넣어둬 정치 도배). 정치 이야기 자체는 통과해야 한다
describe("조롱·도배 규칙", () => {
  it("잡는 것: 정치인 조롱·♥ 짝짓기, 노방장 조롱, 자판 두드리기", () => {
    for (const t of ["트럼프 대통령은 하야하라", "노방장은 노무현을 돌려내라", "김정은♥︎시진핑", "윤석열 꺼져", "ㅁㄴㅇㄹㅁㄴㅇㄹ", "asdfasdf", "ㅋㅋㅋㅋㅋㅋ"])
      expect(trollCheck([t]), t).not.toBeNull();
    expect(trollCheck(["노방장 망해라"])?.category).toBe("troll");
  });
  it("통과: 평범한 정치·경제 이야기, 반응 한 줄(댓글), 링크만 있는 글", () => {
    for (const t of [
      "트럼프 관세 때문에 환율이 올랐네요",
      "문재인 정부 때 부동산 정책 정리해 봤어요",
      "이재명 대표 발언 기사 보셨어요? 의견 궁금해요",
      "노방장 덕분에 좋은 정보 얻었어요",
      "조국을 위해 싸운 독립운동가 이야기",
      "https://www.example.com/item 이거 살까요",
      "가습기",
    ])
      expect(trollCheck([t]), t).toBeNull();
    expect(trollCheck(["ㅋㅋㅋㅋㅋㅋㅋ"], { comment: true })).toBeNull();
    expect(trollCheck(["ㅠㅠㅠㅠㅠㅠ"], { comment: true })).toBeNull();
    // 긴 글은 정치인 이름 + 명령조가 있어도 토론일 수 있어 통과
    expect(trollCheck([`${"이번 대선 공약을 정리했어요. ".repeat(4)}누구는 하야하라고 하지만 윤석열 정부 평가는 갈립니다.`])).toBeNull();
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("🧹 바로 가림(쓴 사람에게만) · 🛠 운영자 가림·복원 · 🔁 똑같은 글 (DB)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const posts = await import("@/lib/repo/posts");
  const comments = await import("@/lib/repo/comments");
  const neo = await import("@/lib/repo/neo");
  const op = await import("@/lib/repo/opHide");
  const reports = await import("@/lib/repo/reports");
  const writer = "w".repeat(64);
  const other = "o".repeat(64);
  const mk = (title: string, body: string, fp = writer) =>
    posts.createPost({ categorySlug: "keyboards", nickname: "작성자", pin: "1234", title, body, summary: { lines: ["하나", "둘", "셋"], model: "author", isAuthorEdited: true }, fingerprint: fp });

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
    await resetRateLimits();
  }, 120_000);
  afterAll(async () => {
    await pool().end();
  });

  it("조롱 글은 올라가되 다른 사람에게 가려지고, 쓴 사람에게는 보인다", async () => {
    const p = await mk("트럼프 대통령은 하야하라", "하야하라");
    const [row] = await query<{ is_blinded: boolean; ai_hidden_reason: string }>("SELECT is_blinded, ai_hidden_reason FROM posts WHERE id = $1", [p.id]);
    expect(row).toMatchObject({ is_blinded: true, ai_hidden_reason: "troll" });
    expect(await posts.isShadowAuthor(p.id, writer)).toBe(true);
    expect(await posts.isShadowAuthor(p.id, other)).toBe(false);
    const ok = await mk("트럼프 관세와 키보드 가격", "부품값이 오를까요? 충분히 긴 본문입니다.");
    expect((await query<{ is_blinded: boolean }>("SELECT is_blinded FROM posts WHERE id = $1", [ok.id]))[0]!.is_blinded).toBe(false);
  });

  it("조롱 댓글: 다른 사람 목록에는 없고, 쓴 사람에게는 본문 그대로", async () => {
    const p = await mk("스위치 후기", "적축 써 봤어요. 충분히 긴 본문입니다.", other);
    const c = await comments.createComment(p.id, { nickname: "a", pin: "1111", body: "노방장 망해라", fingerprint: writer });
    expect(c.body).toBe("노방장 망해라");
    expect(c.hidden_reason).toBeNull();
    const mine = await comments.listComments(p.id, writer);
    expect(mine.find((x) => x.id === c.id)).toMatchObject({ body: "노방장 망해라", hidden_reason: null });
    expect((await comments.listComments(p.id, other)).find((x) => x.id === c.id)).toBeUndefined();
    expect((await comments.listComments(p.id)).find((x) => x.id === c.id)).toBeUndefined();
    const fine = await comments.createComment(p.id, { nickname: "b", pin: "1111", body: "ㅋㅋㅋㅋㅋㅋ", fingerprint: other });
    expect((await comments.listComments(p.id, writer)).some((x) => x.id === fine.id)).toBe(true);
    const auto = await reports.listAutoHidden(7);
    expect(auto.some((r) => r.type === "comment" && r.id === String(c.id) && r.reason === "troll")).toBe(true);
  });

  it("조롱 넣어둬: 쓴 사람 목록에만 보인다", async () => {
    const x = await neo.createNeo({ title: "김정은♥︎시진핑", price: 66533, reason: "", owner: "spam1", fingerprint: "fps" });
    expect((await neo.listNeo("spam1")).open.some((i) => i.id === x.id)).toBe(true);
    expect((await neo.listNeo("viewer")).open.some((i) => i.id === x.id)).toBe(false);
    expect(await neo.getNeo(x.id, "viewer")).toBeNull();
  });

  it("운영자 가림·다시 보이기: 글·댓글·넣어둬, 공개 기록", async () => {
    const p = await mk("멀쩡한 글", "운영자가 실수로 가렸다가 푸는 글입니다. 충분히 긴 본문.", other);
    await op.operatorHide("post", p.id, "신고 확인");
    expect((await query<{ b: boolean; r: string }>("SELECT is_blinded AS b, ai_hidden_reason AS r FROM posts WHERE id = $1", [p.id]))[0]).toEqual({ b: true, r: "operator" });
    expect(await op.operatorRestore("post", p.id, "문제없음")).toEqual({ stillBlinded: false });
    expect((await query<{ b: boolean }>("SELECT is_blinded AS b FROM posts WHERE id = $1", [p.id]))[0]!.b).toBe(false);

    const c = await comments.createComment(p.id, { nickname: "c", pin: "1111", body: "평범한 댓글", fingerprint: other });
    await op.operatorHide("comment", String(c.id), "");
    expect((await comments.listComments(p.id)).find((x) => x.id === c.id)?.hidden_reason).toBe("operator");
    await op.operatorRestore("comment", String(c.id), "");
    expect((await comments.listComments(p.id)).find((x) => x.id === c.id)).toMatchObject({ hidden_reason: null, body: "평범한 댓글" });

    const n = await neo.createNeo({ title: "가습기", price: 50000, reason: "", owner: "own", fingerprint: "fpo" });
    await op.operatorHide("neo", n.id, "");
    expect((await neo.listNeo("viewer")).open.some((i) => i.id === n.id)).toBe(false);
    await op.operatorRestore("neo", n.id, "");
    expect((await neo.listNeo("viewer")).open.some((i) => i.id === n.id)).toBe(true);

    const log = await query<{ action: string }>("SELECT action FROM moderation_log WHERE action LIKE 'operator_%' ORDER BY id");
    expect(log.map((l) => l.action)).toEqual(["operator_hidden", "operator_restored", "operator_hidden", "operator_restored", "operator_hidden", "operator_restored"]);
    await expect(op.operatorHide("post", "999999", "")).rejects.toMatchObject({ status: 404 });
  });

  it("🔁 똑같은 글·댓글·넣어둬를 여러 번 올리면 보고 목록에 (손대지 않음)", async () => {
    await mk("같은 키보드 팝니다", "같은 본문 반복입니다. 충분히 긴 본문.");
    await mk("같은 키보드 팝니다!", "같은 본문 반복입니다.  충분히 긴 본문.");
    const p = await mk("다른 글", "다른 본문입니다. 충분히 긴 본문.");
    await comments.createComment(p.id, { nickname: "d", pin: "1111", body: "여기 정말 좋아요 추천", fingerprint: writer });
    await comments.createComment(p.id, { nickname: "e", pin: "1111", body: "여기 정말 좋아요 추천", fingerprint: other });
    await neo.createNeo({ title: "에어팟", price: 1000, reason: "", owner: "dup", fingerprint: "fpd" });
    await neo.createNeo({ title: "에어팟", price: 2000, reason: "", owner: "dup2", fingerprint: "fpd2" });
    const dups = await reports.listDuplicates(1);
    expect(dups.find((x) => x.type === "post" && x.text.startsWith("같은 키보드"))?.count).toBe(2);
    expect(dups.find((x) => x.type === "comment")).toMatchObject({ count: 2, authors: 2 });
    expect(dups.find((x) => x.type === "neo" && x.text === "에어팟")?.count).toBe(2);
    expect((await query<{ n: number }>("SELECT count(*)::int AS n FROM posts WHERE title LIKE '같은 키보드%' AND NOT is_blinded"))[0]!.n).toBe(2);
  });
});
