import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("operator moderation tools (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const posts = await import("@/lib/repo/posts");
  const boards = await import("@/lib/repo/board-requests");
  const op = await import("@/lib/repo/operator");
  const legal = await import("@/lib/repo/legal");
  const { scanAbuse } = await import("@/lib/jobs/maintenance");

  // 실제 fingerprint 처럼 16진수 64자
  const fp = (n: number | string) => createHash("sha256").update(String(n)).digest("hex");
  const newPost = (title = "테스트 글") =>
    posts.createPost({
      categorySlug: "supplements",
      nickname: "테스터",
      pin: "1234",
      title,
      body: "마그네슘 200mg 제품 비교 본문입니다.",
      summary: { lines: ["하나", "둘", "셋"], model: "author", isAuthorEdited: true },
      fingerprint: fp("author"),
    });
  const establish = (f: string) =>
    query("INSERT INTO fingerprints (fingerprint, first_seen, last_seen) VALUES ($1, now() - interval '3 days', now()) ON CONFLICT DO NOTHING", [f]);
  const scan = async () => {
    const client = await pool().connect();
    try {
      await scanAbuse(client);
    } finally {
      client.release();
    }
    return query<{ id: string; kind: string; subject_id: string; status: string }>("SELECT id, kind, subject_id, status FROM abuse_alerts ORDER BY id");
  };
  const alertOf = async (kind: string, subject: string) => (await scan()).find((a) => a.kind === kind && a.subject_id === subject)!;
  const postRow = (id: string) =>
    query<{ report_count: number; report_score: number; is_blinded: boolean; is_suppressed: boolean; upvotes: number }>(
      "SELECT report_count, report_score, is_blinded, is_suppressed, upvotes FROM posts WHERE id = $1",
      [id],
    ).then((r) => r[0]!);
  const log = () =>
    query<{ action: string; subject_type: string; subject_id: string; affected: number; note: string; reason: string | null }>(
      "SELECT action, subject_type, subject_id, affected, note, reason FROM moderation_log ORDER BY id",
    );

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
    await query("TRUNCATE posts, board_requests, fingerprints, abuse_alerts, moderation_log RESTART IDENTITY CASCADE");
  });

  afterAll(async () => {
    await pool().end();
  });

  it("voids an organized report burst, re-runs the blind rule and accepts the author's appeal", async () => {
    const post = await newPost("표적 글");
    await establish(fp("old"));
    await posts.reportPost(post.id, fp("old"), "진짜 신고");
    // 갓 생긴 fingerprint 의 몰린 신고는 가중치가 절반이라 10건이 몰려야 블라인드된다
    for (let n = 1; n <= 10; n++) await posts.reportPost(post.id, fp(`r${n}`), "광고");
    expect(await postRow(post.id)).toMatchObject({ is_blinded: true, report_count: 11 });

    // 작성자 재검토 요청 — 비밀번호 확인, 글당 한 번
    await expect(op.createAppeal(post.id, fp("author"), "0000", "")).rejects.toMatchObject({ code: "wrong_password" });
    expect(await op.createAppeal(post.id, fp("author"), "1234", "경쟁 업체가 신고를 몰았습니다")).toMatchObject({ kind: "blinded", status: "open" });
    await expect(op.createAppeal(post.id, fp("author"), "1234", "")).rejects.toMatchObject({ code: "already_appealed" });
    const [appeal] = await op.listOpenAppeals();
    expect(appeal).toMatchObject({ post_id: post.id, message: "경쟁 업체가 신고를 몰았습니다" });

    const alert = await alertOf("report_burst", post.id);
    expect((await op.listOpenAppeals())[0]!.open_alert_ids).toEqual([alert.id]);
    expect(await op.previewAlertVoid(alert.id)).toMatchObject({ count: 10, status: "open" });

    const r = await op.voidAlert(alert.id, "갓 생긴 fingerprint 10개의 15분 내 집중 신고");
    expect(r).toMatchObject({ affected: 10, posts: [{ id: post.id, blinded: false }] });
    // 오래된 이용자의 신고 1건은 그대로 남는다
    expect(await postRow(post.id)).toMatchObject({ is_blinded: false, report_count: 1, report_score: 1 });
    expect(await op.getAppeal(post.id)).toMatchObject({ status: "accepted" });
    expect(await log()).toEqual([
      { action: "reports_voided", subject_type: "post", subject_id: post.id, affected: 10, note: "갓 생긴 fingerprint 10개의 15분 내 집중 신고", reason: null },
    ]);
    // 무효화된 신고자는 같은 글을 다시 신고할 수 없다
    expect(await posts.reportPost(post.id, fp("r1"), "광고")).toMatchObject({ alreadyReported: true, is_blinded: false });
    await expect(op.voidAlert(alert.id, "")).rejects.toMatchObject({ code: "alert_closed" });
    expect((await op.listAlertsForReview()).recent[0]).toMatchObject({ id: alert.id, status: "actioned" });
  });

  it("keeps the blind when enough legitimate reports remain", async () => {
    const post = await newPost();
    for (let n = 1; n <= 5; n++) {
      await establish(fp(`u${n}`));
      await posts.reportPost(post.id, fp(`u${n}`), "광고");
    }
    for (let n = 1; n <= 4; n++) await posts.reportPost(post.id, fp(`r${n}`), "광고");
    const alert = await alertOf("report_burst", post.id);
    expect((await op.voidAlert(alert.id, "")).posts).toEqual([{ id: post.id, blinded: true }]);
    expect(await postRow(post.id)).toMatchObject({ is_blinded: true, report_count: 5 });
  });

  it("voids a burst of fresh-fingerprint votes and a mass reporter's reports", async () => {
    const boosted = await newPost("부풀린 글");
    await establish(fp("fan"));
    await posts.votePost(boosted.id, fp("fan"), 1);
    for (let n = 1; n <= 12; n++) await posts.votePost(boosted.id, fp(`v${n}`), 1);
    const va = await alertOf("vote_burst", boosted.id);
    expect(await op.voidAlert(va.id, "")).toMatchObject({ affected: 12 });
    expect((await postRow(boosted.id)).upvotes).toBe(1);

    const others = await Promise.all(Array.from({ length: 11 }, (_, i) => newPost(`다른 글 ${i}`)));
    for (const o of others) await posts.reportPost(o.id, fp("mass"), "도배");
    const ma = await alertOf("mass_reporter", fp("mass").slice(0, 12));
    const r = await op.voidAlert(ma.id, "1시간에 11건");
    expect(r.affected).toBe(11);
    expect(r.posts).toHaveLength(11);
    for (const o of others) expect((await postRow(o.id)).report_count).toBe(0);
    // 공개 기록에는 fingerprint 를 남기지 않는다
    expect((await log()).at(-1)).toMatchObject({ action: "reports_voided", subject_type: "fingerprint", subject_id: "-", affected: 11 });
  });

  it("voids board request vote bursts and recounts", async () => {
    const req = await boards.createBoardRequest("커피 원두", "");
    await establish(fp("b0"));
    await boards.voteBoardRequest(req.id, fp("b0"), 100, 0);
    for (let n = 1; n <= 10; n++) await boards.voteBoardRequest(req.id, fp(`b${n}`), 100, 0);
    const a = await alertOf("board_vote_burst", req.id);
    expect(await op.voidAlert(a.id, "")).toMatchObject({ affected: 10, boardRequest: { id: req.id, voteCount: 1, status: "open" } });
  });

  it("dismisses false positives without touching data or the public log", async () => {
    const post = await newPost();
    for (let n = 1; n <= 12; n++) await posts.votePost(post.id, fp(`v${n}`), 1);
    const a = await alertOf("vote_burst", post.id);
    await op.dismissAlert(a.id, "신제품 공개 직후 정상 유입");
    expect((await postRow(post.id)).upvotes).toBe(12);
    expect(await log()).toEqual([]);
    await expect(op.dismissAlert(a.id, "")).rejects.toMatchObject({ code: "alert_closed" });
    // 이미 처리된 알림은 탐지 배치가 다시 봐도 열리지 않는다
    expect((await scan()).find((x) => x.id === a.id)!.status).toBe("dismissed");
    // 처리한 뒤에 시작된 새 집중이면 다시 열린다
    await query("UPDATE votes SET created_at = created_at - interval '2 hours'");
    await query("UPDATE abuse_alerts SET resolved_at = now() - interval '90 minutes'");
    for (let n = 20; n <= 35; n++) await posts.votePost(post.id, fp(`v${n}`), 1);
    expect((await scan()).find((x) => x.id === a.id)!.status).toBe("open");
  });

  it("releases an AI false positive and settles the appeal", async () => {
    const post = await newPost();
    await query("UPDATE posts SET is_suppressed = true, spam_score = 0.8, moderation_note = '광고 문구', moderated_by = 'claude' WHERE id = $1", [post.id]);
    expect(await op.createAppeal(post.id, fp("author"), "1234", "리뷰 글입니다")).toMatchObject({ kind: "suppressed" });
    expect((await op.listSuppressed()).map((p) => p.id)).toEqual([post.id]);
    await op.releaseSuppression(post.id, "제품 비교 정보 글");
    expect(await postRow(post.id)).toMatchObject({ is_suppressed: false });
    expect(await op.getAppeal(post.id)).toMatchObject({ status: "accepted" });
    await expect(op.releaseSuppression(post.id, "")).rejects.toMatchObject({ code: "not_suppressed" });
    expect((await log()).map((l) => l.action)).toEqual(["suppression_released"]);
  });

  it("rejects appeals publicly and refuses appeals that do not apply", async () => {
    const visible = await newPost();
    await expect(op.createAppeal(visible.id, fp("author"), "1234", "")).rejects.toMatchObject({ code: "not_appealable" });

    const held = await newPost();
    await legal.applyLegalHold(held.id, "privacy", "");
    await expect(op.createAppeal(held.id, fp("author"), "1234", "")).rejects.toMatchObject({ code: "legal_hold" });

    const blinded = await newPost();
    for (let n = 1; n <= 5; n++) {
      await establish(fp(`u${n}`));
      await posts.reportPost(blinded.id, fp(`u${n}`), "광고");
    }
    await op.createAppeal(blinded.id, fp("author"), "1234", "억울합니다");
    await expect(op.rejectAppeal(blinded.id, " ")).rejects.toMatchObject({ code: "note_required" });
    await op.rejectAppeal(blinded.id, "신고가 모두 서로 다른 기존 이용자이며 조작 정황이 없음");
    expect(await op.getAppeal(blinded.id)).toMatchObject({ status: "rejected", decision_note: "신고가 모두 서로 다른 기존 이용자이며 조작 정황이 없음" });
    await expect(op.rejectAppeal(blinded.id, "다시")).rejects.toMatchObject({ code: "appeal_closed" });
    expect((await log()).map((l) => l.action)).toEqual(["legal_hold", "appeal_rejected"]);
    expect((await legal.moderationLog()).map((l) => [l.action, l.subject_id])).toEqual([
      ["appeal_rejected", blinded.id],
      ["legal_hold", held.id],
    ]);
  });

  it("rejects and merges board requests", async () => {
    const bad = await boards.createBoardRequest("불법 도박", "");
    await op.rejectBoardRequest(bad.id, "illegal", "");
    await expect(op.rejectBoardRequest(bad.id, "illegal", "")).rejects.toMatchObject({ code: "request_closed" });
    // 거절된 요청은 이름 자체가 유해할 수 있어 공개 목록에서 빠진다
    expect((await boards.listBoardRequests()).find((r) => r.id === bad.id)).toBeUndefined();

    const a = await boards.createBoardRequest("원두 커피", "");
    const b = await boards.createBoardRequest("커피 원두", "");
    for (const n of [1, 2, 3]) await boards.voteBoardRequest(a.id, fp(`m${n}`), 100, 0);
    for (const n of [3, 4]) await boards.voteBoardRequest(b.id, fp(`m${n}`), 100, 0);
    expect(await op.mergeBoardRequest(a.id, b.id, "")).toEqual({ voteCount: 4 }); // m3 중복은 한 표
    const rows = await query<{ id: string; status: string; merged_into: string | null }>("SELECT id, status, merged_into FROM board_requests WHERE id = ANY($1::bigint[]) ORDER BY id", [[a.id, b.id]]);
    expect(rows).toEqual([
      { id: a.id, status: "duplicate", merged_into: b.id },
      { id: b.id, status: "open", merged_into: null },
    ]);
    await expect(op.mergeBoardRequest(b.id, b.id, "")).rejects.toMatchObject({ code: "same_request" });
    await expect(op.mergeBoardRequest(a.id, b.id, "")).rejects.toMatchObject({ code: "request_closed" });
    expect((await log()).map((l) => [l.action, l.reason])).toEqual([
      ["board_request_rejected", "illegal"],
      ["board_request_merged", null],
    ]);
    expect(await op.pendingCounts()).toEqual({ appeals: 0, alerts: 0 });
  });
});
