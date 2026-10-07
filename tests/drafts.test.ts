import { afterAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("operator drafts — 승인 대기함 (Sprint 51)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const drafts = await import("@/lib/repo/drafts");
  const made: string[] = [];

  afterAll(async () => {
    if (made.length) await query("DELETE FROM posts WHERE id = ANY($1::bigint[])", [made]);
    await query("DELETE FROM operator_drafts");
    await pool().end();
  });

  it("posts a draft as the operator only after approval, with the edited text, once", async () => {
    const draft = await drafts.createDraft({ kind: "post", categorySlug: "perfume-audio", pin: "8023", title: "초안 제목", body: "초안 본문입니다. 여러분 생각은?" });
    expect(draft.status).toBe("pending");
    expect(await drafts.pendingDraftCount()).toBe(1);
    // 승인 전에는 글이 없다
    expect((await query("SELECT 1 FROM posts WHERE title = '초안 제목'")).length).toBe(0);
    const done = await drafts.approveDraft(draft.id, { title: "고친 제목", body: "고친 본문입니다. 여러분 생각은?" });
    expect(done.status).toBe("posted");
    made.push(done.result_post_id!);
    const [post] = await query<{ nickname: string; title: string; post_type: string; is_ai_curated: boolean }>("SELECT nickname, title, post_type, is_ai_curated FROM posts WHERE id = $1", [done.result_post_id]);
    expect(post).toEqual({ nickname: "덕후1호", title: "고친 제목", post_type: "chat", is_ai_curated: false });
    // 비밀번호는 지워지고, 두 번 승인되지 않는다
    expect((await query<{ pin: string | null }>("SELECT pin FROM operator_drafts WHERE id = $1", [draft.id]))[0]!.pin).toBeNull();
    await expect(drafts.approveDraft(draft.id)).rejects.toMatchObject({ status: 409 });
  });

  it("replies to a comment, marks threads drafts as copied and discards", async () => {
    const postId = made[0]!;
    const c = await drafts.createDraft({ kind: "comment", postId, pin: "8023", body: "@누군가 답글 초안" });
    const done = await drafts.approveDraft(c.id);
    expect(done.result_comment_id).toBeTruthy();
    const t = await drafts.createDraft({ kind: "threads", body: "스레드 본문", extra: "nobangjang.com/posts/1" });
    expect((await drafts.approveDraft(t.id)).status).toBe("copied");
    const x = await drafts.createDraft({ kind: "instagram", body: "버릴 초안" });
    await drafts.discardDraft(x.id);
    await expect(drafts.discardDraft(x.id)).rejects.toMatchObject({ status: 409 });
    const { pending, done: list } = await drafts.listDrafts();
    expect(pending).toEqual([]);
    expect(list.map((r) => r.status).sort()).toEqual(["copied", "discarded", "posted", "posted"]);
  });

  it("refuses operator drafts without the 4-digit pin", async () => {
    await expect(drafts.createDraft({ kind: "post", categorySlug: "perfume-audio", title: "t", body: "본문" })).rejects.toMatchObject({ status: 400 });
    await expect(drafts.createDraft({ kind: "comment", pin: "8023", body: "본문" })).rejects.toMatchObject({ status: 400 });
  });
});
