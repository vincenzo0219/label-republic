import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { heuristicAbuse } from "@/lib/abuse";

describe("AI moderation rules (Sprint 37)", () => {
  it("catches clear profanity, including spaced-out and jamo forms", () => {
    for (const t of ["씨발 뭐냐", "씨.발", "병 신 같은 스펙", "ㅅㅂ 진짜", "ㅆ ㅂ", "개새끼", "좆같네"]) {
      expect(heuristicAbuse(t)?.category, t).toBe("profanity");
    }
  });

  it("leaves ordinary words and mild slang alone", () => {
    for (const t of [
      "시발점이 어디냐", "시발역에서 만나요", "존나 좋은 스위치", "미친 가성비", "이 제품 라벨은 엉터리입니다", "ㅂㅅㄱ 아님", "010 모델과 020 모델",
      // 취미 글에서 흔한 말 (Sprint 38)
      "매장에 찾아가서 직접 들어봤는데 소리가 좋네요", "폼을 넣으니 통울림을 죽여버리네요", "저음을 죽여버리는 이어팁", "이 가격이면 죽여주네요",
    ]) {
      expect(heuristicAbuse(t), t).toBeNull();
    }
  });

  it("catches group slurs, threats and personal info", () => {
    expect(heuristicAbuse("한남충들 또 시작")?.category).toBe("hate");
    expect(heuristicAbuse("틀딱 소리")?.category).toBe("hate");
    expect(heuristicAbuse("집 찾아가서 가만 안 둔다")?.category).toBe("harassment");
    expect(heuristicAbuse("너 진짜 죽여버린다")?.category).toBe("harassment");
    expect(heuristicAbuse("니네 다 죽일 거야")?.category).toBe("harassment");
    expect(heuristicAbuse("연락 010-1234-5678 로")?.category).toBe("personal_info");
    expect(heuristicAbuse("01012345678")?.category).toBe("personal_info");
    expect(heuristicAbuse("메일 someone@example.com")?.category).toBe("personal_info");
    expect(heuristicAbuse("900101-1234567")?.category).toBe("personal_info");
  });

  it("masks phone numbers, emails and resident numbers instead of hiding the whole text", async () => {
    const { maskPersonalInfo } = await import("@/lib/abuse");
    expect(maskPersonalInfo("연락 010-1234-5678, me@example.com, 900101-1234567 끝")).toEqual({
      text: "연락 [개인정보 가림], [개인정보 가림], [개인정보 가림] 끝", masked: true,
    });
    expect(maskPersonalInfo("1588-1234 고객센터, 모델 01012")).toEqual({ text: "1588-1234 고객센터, 모델 01012", masked: false });
  });

  it("stays linear on long crafted input (Sprint 38: the email pattern took ~0.5 s on 20,000 chars)", async () => {
    const { maskPersonalInfo } = await import("@/lib/abuse");
    const { curatorSafetyProblems } = await import("@/lib/curator-ai");
    for (const t of ["a.".repeat(10000) + "@", "010-".repeat(5000), "a_b-c.d+e".repeat(2200), "1.".repeat(10000)]) {
      const s = performance.now();
      heuristicAbuse(t);
      maskPersonalInfo(t);
      curatorSafetyProblems({ title: "제목입니다", body: t, summary: ["a", "b", "c"], comments: [] });
      expect(performance.now() - s, t.slice(0, 10)).toBeLessThan(100);
    }
  });

  it("checks every text given (title and body)", () => {
    expect(heuristicAbuse("평범한 제목", "본문에 씨발")?.category).toBe("profanity");
    expect(heuristicAbuse("평범한 제목", "평범한 본문")).toBeNull();
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

// Claude 판단은 테스트에서 흉내 낸다 (규칙 판단은 진짜)
const aiVerdict = vi.hoisted(() => ({ next: null as null | { category: "harassment"; evidence: string; model: string } }));
vi.mock("@/lib/abuse", async (orig) => ({
  ...(await orig<typeof import("@/lib/abuse")>()),
  aiAbuse: async () => aiVerdict.next,
}));

d("AI hides abusive posts and comments with a reason (database, Sprint 37)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const posts = await import("@/lib/repo/posts");
  const comments = await import("@/lib/repo/comments");
  const operator = await import("@/lib/repo/operator");
  const { transparencyStats, moderationLog } = await import("@/lib/repo/legal");
  const { writeLimit } = await import("@/lib/repo/write-limits");

  let n = 0;
  const who = { fingerprint: "b".repeat(64), net: "net-b", agent: "agent-b" };
  async function post(body = "스위치 키감을 적었습니다. 충분히 긴 본문입니다.") {
    return posts.createPost({
      categorySlug: "keyboards", nickname: "작성자", pin: "1234", title: `스위치 후기 ${++n}`, body,
      summary: { lines: ["하나", "둘", "셋"], model: "author", isAuthorEdited: true }, fingerprint: who.fingerprint, network: who.net, agent: who.agent,
    });
  }

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  beforeEach(async () => {
    await resetRateLimits();
    await query("TRUNCATE posts, moderation_log RESTART IDENTITY CASCADE");
    aiVerdict.next = null;
  });
  afterAll(async () => {
    await pool().end();
  });

  it("hides a post with clear profanity at once, shows only the reason, and keeps it out of lists", async () => {
    const p = await post("이 스위치 만든 놈들 씨발 진짜");
    expect(p).toMatchObject({ is_blinded: true, ai_hidden_reason: "profanity", title: "", body: "" });
    const row = (await query<{ blinded_at: string | null; ai_hidden_note: string; ai_hidden_model: string }>(
      "SELECT blinded_at, ai_hidden_note, ai_hidden_model FROM posts WHERE id = $1", [p.id],
    ))[0]!;
    // 신고 블라인드 시각은 쓰지 않는다 (쓰기 제한·신고 통계와 섞이지 않게)
    expect(row).toMatchObject({ blinded_at: null, ai_hidden_note: "씨발", ai_hidden_model: "abuse-rules-v1" });
    const visible = await post();
    const list = await posts.listPosts({ sort: "latest" });
    expect(list.items.map((i) => i.id)).toEqual([visible.id]);
    // 댓글·투표 불가 (블라인드와 같은 경로)
    await expect(comments.createComment(p.id, { nickname: "a", pin: "1111", body: "댓글" })).rejects.toMatchObject({ status: 410 });
  });

  it("keeps a post with a phone number visible and editable, with the number removed; spam is judged on the original", async () => {
    const p = await post("문의는 010-1234-5678 로 주세요. 스위치 키감 후기입니다.");
    expect(p).toMatchObject({ is_blinded: false, body: "문의는 [개인정보 가림] 로 주세요. 스위치 키감 후기입니다." });
    const u = await posts.updatePost(p.id, who.fingerprint, "1234", { body: "메일 me@example.com 로 주세요. 스위치 키감 후기입니다." });
    expect(u.body).toBe("메일 [개인정보 가림] 로 주세요. 스위치 키감 후기입니다.");
  });

  it("does not count AI hides toward the write limit, and report recounts keep the post hidden", async () => {
    for (let i = 0; i < 4; i++) await post("병신 같은 스펙");
    expect(await writeLimit(who)).toBeNull();
    const id = (await query<{ id: string }>("SELECT id::text FROM posts LIMIT 1"))[0]!.id;
    expect((await query<{ blind: boolean }>("SELECT recount_reports($1) AS blind", [id]))[0]!.blind).toBe(true);
  });

  it("hides after the async Claude check when confident, and not after an operator released it", async () => {
    const p = await post("스위치 설명");
    aiVerdict.next = { category: "harassment", evidence: "특정인을 조롱함", model: "claude-test" };
    await posts.aiModeratePost(p.id);
    expect(await posts.getPost(p.id)).toMatchObject({ is_blinded: true, ai_hidden_reason: "harassment" });

    // 작성자 재검토 요청 → 종류 ai_hidden → 운영자가 오판으로 풂 → 요청 자동 수용, 공개 기록
    await operator.createAppeal(p.id, who.fingerprint, "1234", "조롱이 아니라 제품 비판입니다.");
    expect((await operator.getAppeal(p.id))!.kind).toBe("ai_hidden");
    await expect(operator.releaseAiHide("post", p.id, "")).rejects.toMatchObject({ status: 400 });
    expect(await operator.releaseAiHide("post", p.id, "제품 비판이라 오판")).toEqual({ stillBlinded: false });
    expect(await posts.getPost(p.id)).toMatchObject({ is_blinded: false, ai_hidden_reason: null, body: "스위치 설명" });
    expect((await operator.getAppeal(p.id))!.status).toBe("accepted");
    const log = await moderationLog(10);
    expect(log[0]).toMatchObject({ action: "ai_hide_released", subject_type: "post", reason: "harassment", note: "제품 비판이라 오판" });

    // 늦게 끝난 AI 판단이 다시 가리지 않는다
    await posts.aiModeratePost(p.id);
    expect((await posts.getPost(p.id))!.is_blinded).toBe(false);
    // 고치면 다시 판단 — 규칙에 걸리면 바로 가려진다
    await posts.updatePost(p.id, who.fingerprint, "1234", { body: "고쳤는데 ㅅㅂ" });
    expect(await posts.getPost(p.id)).toMatchObject({ is_blinded: true, ai_hidden_reason: "profanity" });
  });

  it("keeps a report blind when the AI hide is released", async () => {
    const p = await post("씨발");
    await query("UPDATE community_rules SET value = 1 WHERE key = 'post_blind_reports'");
    await query("INSERT INTO reports (post_id, reporter_fingerprint, reason) VALUES ($1, $2, 'spam')", [p.id, "c".repeat(64)]);
    expect(await operator.releaseAiHide("post", p.id, "오판")).toEqual({ stillBlinded: true });
    await query("UPDATE community_rules SET value = NULL WHERE key = 'post_blind_reports'");
  });

  it("hides comments: rules at once, Claude afterwards; the body is never sent while hidden", async () => {
    const p = await post();
    // 연락처는 댓글을 가리지 않고 그 부분만 지워 저장
    const c0 = await comments.createComment(p.id, { nickname: "z", pin: "1111", body: "제 번호 010-2222-3333 으로 연락 주세요" });
    expect(c0).toMatchObject({ body: "제 번호 [개인정보 가림] 으로 연락 주세요", hidden_reason: null });
    await query("DELETE FROM comments WHERE id = $1", [c0.id]);
    const c1 = await comments.createComment(p.id, { nickname: "a", pin: "1111", body: "틀딱들은 모름" });
    expect(c1).toMatchObject({ body: "", hidden_reason: "hate" });
    const c2 = await comments.createComment(p.id, { nickname: "b", pin: "1111", body: "너 같은 사람은 정말 한심하다" });
    expect(c2.hidden_reason).toBeNull();
    aiVerdict.next = { category: "harassment", evidence: "상대를 비하", model: "claude-test" };
    expect(await comments.aiModerateComment(String(c2.id))).toBe(true);
    const list = await comments.listComments(p.id);
    expect(list.map((c) => [c.body, c.hidden_reason])).toEqual([["", "hate"], ["", "harassment"]]);

    expect((await operator.listAiHidden()).map((h) => [h.kind, h.label])).toEqual([["comment", "인신공격·위협"], ["comment", "혐오·비하 표현"]]);
    await operator.releaseAiHide("comment", String(c2.id), "비판 수준");
    expect((await comments.listComments(p.id))[1]).toMatchObject({ body: "너 같은 사람은 정말 한심하다", hidden_reason: null });
    expect(await comments.aiModerateComment(String(c2.id))).toBe(false);

    const month = (await transparencyStats())[0]!;
    expect(month.ai_hides).toBe(1); // 풀린 것은 빠짐
    expect(month.auto_blinds).toBe(0);
  });

  it("realtime events carry no body for hidden comments, and announce hides and releases", async () => {
    const p = await post();
    const listener = await pool().connect();
    const events: { type: string; comment: { id: string; body: string; hidden_reason: string | null } }[] = [];
    listener.on("notification", (m) => events.push(JSON.parse(m.payload!)));
    await listener.query("LISTEN comment_events");
    try {
      const c = await comments.createComment(p.id, { nickname: "a", pin: "1111", body: "한남충 소리" });
      const ok = await comments.createComment(p.id, { nickname: "b", pin: "1111", body: "평범한 댓글" });
      aiVerdict.next = { category: "harassment", evidence: "x", model: "claude-test" };
      await comments.aiModerateComment(String(ok.id));
      await operator.releaseAiHide("comment", String(c.id), "인용한 표현");
      await new Promise((r) => setTimeout(r, 200));
      expect(events.map((e) => [e.type, e.comment.id, e.comment.body, e.comment.hidden_reason])).toEqual([
        ["created", String(c.id), "", "hate"],
        ["created", String(ok.id), "평범한 댓글", null],
        ["hidden", String(ok.id), "", "harassment"],
        ["hidden", String(c.id), "한남충 소리", null],
      ]);
    } finally {
      await listener.query("UNLISTEN comment_events");
      listener.release();
    }
  });
});
