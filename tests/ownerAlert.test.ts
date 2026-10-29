import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { excerpt, isHumanWrite, ownerAlertMessage, ownerAlertWait, type OwnerAlertItem } from "@/lib/ownerAlert";

const vapid = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
process.env.VAPID_PRIVATE_KEY = vapid.privateKey;

const FP = "a".repeat(64);
const item = (id: string, over: Partial<OwnerAlertItem> = {}): OwnerAlertItem => ({ id, kind: "comment", room: "향수방", nickname: "손님", excerpt: "안녕하세요", url: `/posts/1#c${id}`, ...over });

describe("🔔 사람 글·댓글 알림 — 판단·문구 (10/25)", () => {
  it("counts only people: fingerprint, not AI, not operator nicknames", () => {
    expect(isHumanWrite({ kind: "comment", nickname: "손님", fingerprint: FP })).toBe(true);
    expect(isHumanWrite({ kind: "comment", nickname: "손님" })).toBe(false); // 운영 초안·환영 답글 (지문 없음)
    expect(isHumanWrite({ kind: "post", nickname: "손님", fingerprint: FP, isAiCurated: true })).toBe(false);
    expect(isHumanWrite({ kind: "post", nickname: "노방장", fingerprint: FP })).toBe(false);
    expect(isHumanWrite({ kind: "post", nickname: " 덕후1호 ", fingerprint: FP })).toBe(false);
    expect(isHumanWrite({ kind: "post", nickname: "AI 큐레이터", fingerprint: FP })).toBe(false);
    expect(isHumanWrite({ kind: "gig", nickname: "테스트센터", fingerprint: FP })).toBe(true);
  });

  it("🚩 report alerts read as reports (10/29)", () => {
    expect(ownerAlertMessage([item("1", { kind: "report", room: "주식", nickname: "글 3건", excerpt: "광고 · 제목" })])).toMatchObject({ title: "🚩 신고 · 주식 · 글 3건", body: "광고 · 제목" });
    expect(ownerAlertMessage([item("1", { kind: "report" }), item("2", { kind: "report", room: "💳 넣어둬" })])).toMatchObject({ title: "🚩 신고 2건", url: "/admin#reports-h" });
  });

  it("cuts excerpts to 40 chars on one line", () => {
    expect(excerpt("  줄\n바꿈   있음 ")).toBe("줄 바꿈 있음");
    expect(excerpt("가".repeat(50))).toBe(`${"가".repeat(40)}…`);
  });

  it("sends at most once per 60s per device", () => {
    const now = new Date("2026-10-25T03:00:00Z");
    expect(ownerAlertWait(null, now)).toBe(0);
    expect(ownerAlertWait(new Date(now.getTime() - 61_000), now)).toBe(0);
    expect(ownerAlertWait(new Date(now.getTime() - 20_000), now)).toBe(40_000);
  });

  it("names the room, person and text for one; bundles many", () => {
    expect(ownerAlertMessage([item("5")])).toEqual({ title: "✍️ 댓글 · 향수방 · 손님", body: "안녕하세요", url: "/posts/1#c5", tag: "lr-owner-5" });
    const many = ownerAlertMessage([item("5"), item("6", { kind: "post", nickname: "새손님", excerpt: "첫 글", url: "/posts/9" }), item("7", { nickname: "셋째" })]);
    expect(many.title).toBe("✍️ 새 글·댓글 3개");
    expect(many.body).toBe("셋째: 안녕하세요 / 새손님: 첫 글");
    expect(many.url).toBe("/posts/1#c7");
    expect(ownerAlertMessage([item("1"), item("2")]).title).toBe("✍️ 새 댓글 2개");
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("🔔 사람 글·댓글 알림 — DB (10/25)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const push = await import("@/lib/repo/push");
  const posts = await import("@/lib/repo/posts");
  const comments = await import("@/lib/repo/comments");
  const drafts = await import("@/lib/repo/drafts");
  const gigs = await import("@/lib/repo/gigs");
  const { kstYmd } = await import("@/lib/instructorRoom");
  const oa = await import("@/lib/repo/ownerAlert");
  const sent: { title: string; body: string; url: string }[] = [];
  const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/owner-1", p256dh: "p".repeat(20), auth: "a".repeat(16) };
  let postId = "";

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
    oa.setOwnerAlertSend(async (_s, m) => (sent.push(m), "sent"));
  });
  afterAll(async () => {
    await oa.ownerAlertIdle();
    oa.setOwnerAlertSend(null);
    await pool().end();
  });

  const count = async () => (await query<{ n: number }>("SELECT count(*)::int AS n FROM owner_alerts"))[0]!.n;
  const comment = (nickname: string, body: string, fingerprint?: string) => comments.createComment(postId, { nickname, pin: "1234", body, fingerprint });

  it("records nothing while no device has it on", async () => {
    const p = await posts.createPost({ categorySlug: "perfume-audio", nickname: "손님", pin: "1234", title: "켜기 전 글", body: "아직 아무도 안 켰어요", summary: null, postType: "chat", fingerprint: FP });
    postId = p.id;
    await oa.ownerAlertIdle();
    expect(await count()).toBe(0);
    expect(sent).toEqual([]);
  });

  it("sends a human comment right away, but not an operator draft or operator nickname", async () => {
    await push.subscribe(sub, { products: [], posts: [] }, "f".repeat(64));
    expect(await oa.setOwnerAlert(sub.endpoint, true)).toBe(true);
    expect(await oa.ownerAlertDevices()).toBe(1);

    // 운영 초안 승인 → 지문 없는 댓글
    const dr = await drafts.createDraft({ kind: "comment", postId, pin: "8023", body: "운영 초안 댓글" });
    await drafts.approveDraft(dr.id);
    await comment("노방장", "운영자 닉네임 댓글", FP);
    await oa.ownerAlertIdle();
    expect(await count()).toBe(0);
    expect(sent).toEqual([]);

    const c = await comment("손님", "사람이 쓴 댓글입니다", FP);
    await oa.ownerAlertIdle();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ title: expect.stringContaining("손님"), body: "사람이 쓴 댓글입니다", url: `/posts/${postId}#c${c.id}` });
  });

  it("bundles writes within 60s into one push", async () => {
    await comment("손님2", "두 번째 댓글", FP);
    const tomorrow = kstYmd(new Date(Date.now() + 2 * 86400_000));
    await gigs.createGig(
      { nickname: "테스트센터", pw: "1234", kind: "sub", studio: "알림필라", sido: "서울", sigungu: "마포구", station: "", address: "", dates: [tomorrow], weekdays: [], times: ["19:00"], classType: "기구필라테스", equipment: [], pay: 35000, tax: false, payday: "", contact: "010-0000-1111", notes: "", raw: "" },
      { fingerprint: FP, net: null },
    );
    await oa.ownerAlertIdle();
    expect(sent).toHaveLength(1); // 60초 안 → 아직
    expect(await count()).toBe(3);
    const r = await oa.flushOwnerAlerts(new Date(Date.now() + 61_000), { noTimer: true });
    expect(r).toMatchObject({ ran: true, sent: 1 });
    expect(sent[1]!.title).toBe("✍️ 새 글·댓글 2개");
    expect(sent[1]!.url).toMatch(/^\/gigs\/\d+$/);
    // 다시 돌려도 같은 소식은 안 간다
    expect((await oa.flushOwnerAlerts(new Date(Date.now() + 200_000), { noTimer: true })).sent).toBe(0);
  });

  it("🚩 a report is sent to the operator instead of hiding (10/29)", async () => {
    await posts.reportPost(postId, "r".repeat(64), "광고·홍보");
    await oa.ownerAlertIdle();
    const r = await oa.flushOwnerAlerts(new Date(Date.now() + 400_000), { noTimer: true });
    expect(r).toMatchObject({ sent: 1 });
    expect(sent[2]).toMatchObject({ title: expect.stringContaining("🚩 신고"), url: `/posts/${postId}` });
    expect(sent[2]!.body).toContain("광고·홍보");
    expect((await posts.getPost(postId))!.is_blinded).toBe(false);
  });

  it("turns off", async () => {
    expect(await oa.setOwnerAlert(sub.endpoint, false)).toBe(false);
    await comment("손님3", "끈 뒤 댓글", FP);
    await oa.ownerAlertIdle();
    expect(sent).toHaveLength(3);
    await expect(oa.setOwnerAlert("https://fcm.googleapis.com/fcm/send/none", true)).rejects.toMatchObject({ status: 404 });
  });
});
