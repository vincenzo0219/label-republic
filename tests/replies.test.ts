import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// 푸시 설정은 config 를 처음 읽기 전에
const vapid = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
const { extractMentions, resolveMentions, splitMentions } = await import("@/lib/mentions");
const { commentSchema } = await import("@/lib/validation");

describe("mentions (Sprint 30)", () => {
  const nicks = ["홍길동", "홍길동님", "Measure Kim", "측정러"];

  it("matches only nicknames in the thread, longest first, max 3, not inside words or emails", () => {
    expect(extractMentions("@홍길동님 말씀이 맞아요", nicks)).toEqual(["홍길동님"]);
    expect(extractMentions("@홍길동 님, @측정러 확인 부탁", nicks)).toEqual(["홍길동", "측정러"]);
    expect(extractMentions("@measure kim 측정값 공유해 주세요", nicks)).toEqual(["Measure Kim"]);
    expect(extractMentions("메일 a@측정러.com 로", nicks)).toEqual([]);
    expect(extractMentions("@없는사람 안녕", nicks)).toEqual([]);
    expect(extractMentions("@측정러 @측정러 @홍길동 @홍길동님 @Measure Kim", nicks)).toEqual(["측정러", "홍길동", "홍길동님"]);
  });

  it("splits a body for display without changing the text", () => {
    const body = "(@측정러) 표본이 작아요 @MEASURE KIM";
    const parts = splitMentions(body, nicks);
    expect(parts.map((p) => p.text).join("")).toBe(body);
    expect(parts.filter((p) => p.mention).map((p) => p.text)).toEqual(["@측정러", "@MEASURE KIM"]);
  });

  it("resolves nicknames to that nickname's comments, newest first, skipping mine, AI and the reply target", () => {
    const thread = [
      { id: "1", nickname: "측정러", mine: false, ai: false },
      { id: "5", nickname: "측정러", mine: false, ai: false },
      { id: "6", nickname: "측정러", mine: true, ai: false },
      { id: "7", nickname: "AI 큐레이터", mine: false, ai: true },
      { id: "8", nickname: "홍길동", mine: false, ai: false },
    ];
    expect(resolveMentions(["측정러", "홍길동"], thread, "8")).toEqual(["5", "1"]);
    expect(resolveMentions(["AI 큐레이터"], thread, null)).toEqual([]);
    const many = Array.from({ length: 15 }, (_, i) => ({ id: String(i + 10), nickname: "도배", mine: false, ai: false }));
    expect(resolveMentions(["도배"], many, null)).toHaveLength(10);
  });

  it("accepts a numeric parentId only", () => {
    const base = { nickname: "댓글러", pw: "1234", body: "답글" };
    expect(commentSchema.safeParse({ ...base, parentId: "12" }).success).toBe(true);
    expect(commentSchema.safeParse({ ...base, parentId: "1 OR 1=1" }).success).toBe(false);
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("replies & mentions (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const posts = await import("@/lib/repo/posts");
  const comments = await import("@/lib/repo/comments");
  const { watchUpdates } = await import("@/lib/repo/watch");
  const report = await import("@/lib/repo/report");
  const push = await import("@/lib/repo/push");
  const { runPushBatch } = await import("@/lib/jobs/push");
  const ME = "e".repeat(64);
  const OTHER = "o".repeat(64);
  const THIRD = "t".repeat(64);

  const newPost = (fp: string, title: string) =>
    posts.createPost({
      categorySlug: "supplements", nickname: "작성자", pin: "1234", title, body: "마그네슘 함량을 정리했습니다. 1정 350mg 입니다.",
      summary: { lines: ["하나", "둘", "셋"], model: "author", isAuthorEdited: true }, fingerprint: fp,
    });
  const say = (postId: string, fp: string, nickname: string, body: string, parentId?: string) =>
    comments.createComment(postId, { nickname, pin: "1111", body, fingerprint: fp, parentId });

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  beforeEach(async () => {
    await resetRateLimits();
    await query("TRUNCATE posts, products, fingerprints, push_subscriptions, push_runs RESTART IDENTITY CASCADE");
  });
  afterAll(async () => {
    await pool().end();
  });

  it("stores replies and mentions; the reply target must be a comment of the same post", async () => {
    const post = await newPost(OTHER, "비타민 D 흡수율");
    const elsewhere = await newPost(OTHER, "다른 글");
    const mine = await say(post.id, ME, "나나", "지용성이라 식후가 낫다고 들었어요");
    const theirs = await say(post.id, THIRD, "측정러", "혈중 농도 측정 자료 있어요");
    const foreign = await say(elsewhere.id, THIRD, "측정러", "다른 글 댓글");

    const r = await say(post.id, OTHER, "작성자", "맞아요. @측정러 자료도 같이 봐 주세요", mine.id);
    expect(r).toMatchObject({ parent_id: mine.id, mentions: [theirs.id] });
    // 다른 글 댓글에는 답할 수 없고, 멘션도 이 글의 댓글만
    await expect(say(post.id, OTHER, "작성자", "답글", foreign.id)).rejects.toMatchObject({ status: 404 });
    expect((await say(elsewhere.id, OTHER, "작성자", "@나나 여기도요")).mentions).toEqual([]);
    // 나 자신을 멘션해도 내 댓글로 알리지 않는다
    expect((await say(post.id, ME, "나나", "@나나 제가 위에 쓴 대로")).mentions).toEqual([]);

    // 원 댓글이 지워지면 답글은 남고 대상만 비운다 (실시간 목록·알림과 같게)
    const listed = await comments.listComments(post.id);
    expect(listed.find((c) => c.id === r.id)).toMatchObject({ parent_id: mine.id, mentions: [theirs.id] });
    await comments.deleteComment(mine.id, ME, "1111");
    expect((await comments.listComments(post.id)).find((c) => c.id === r.id)).toMatchObject({ parent_id: null });
  });

  it("reports replies and mentions to my comments only, without my own and without double-counting watched posts", async () => {
    const post = await newPost(OTHER, "비타민 D 흡수율");
    const mine = await say(post.id, ME, "나나", "지용성이라 식후가 낫다고 들었어요");
    const since = new Date();
    await new Promise((r) => setTimeout(r, 10));
    const reply = await say(post.id, OTHER, "작성자", "네 그 말이 맞아요", mine.id);
    const mention = await say(post.id, THIRD, "측정러", "@나나 님 말씀 근거 있나요?");
    await say(post.id, THIRD, "측정러", "그냥 댓글"); // 답글·멘션이 아닌 댓글
    await say(post.id, ME, "나나", "제 답글", reply.id); // 내 활동

    // 닉네임을 흉내 내도 알림은 댓글 번호를 가진 브라우저에만
    const impostor = await say(post.id, "i".repeat(64), "나나", "저도 나예요");
    let u = await watchUpdates([], [post.id], since, ME, { comments: [mine.id] });
    expect(u.reply_count).toBe(2);
    expect(u.replies.map((r) => [r.id, r.kind, r.to, r.nickname, r.post_title])).toEqual([
      [mention.id, "mention", mine.id, "측정러", "비타민 D 흡수율"],
      [reply.id, "reply", mine.id, "작성자", "비타민 D 흡수율"],
    ]);
    // 지켜보는 글의 새 댓글에서는 답글·멘션을 빼고 센다 (그냥 댓글 + 흉내 낸 사람 댓글)
    expect(u.posts[0]!.new_comments).toBe(2);
    expect(u.total).toBe(4);
    expect((await watchUpdates([], [], since, "i".repeat(64), { comments: [impostor.id] })).reply_count).toBe(0);

    // 지워진 내 댓글은 브라우저가 목록에서 빼도록
    await comments.deleteComment(mine.id, ME, "1111");
    u = await watchUpdates([], [], since, ME, { comments: [mine.id] });
    expect(u).toMatchObject({ gone_comments: [mine.id], reply_count: 1 }); // 멘션은 남음 (답글은 대상이 비워짐)

    // 블라인드된 글의 답글은 알리지 않는다
    const again = await say(post.id, ME, "나나", "다시 씁니다");
    await say(post.id, OTHER, "작성자", "답글", again.id);
    expect((await watchUpdates([], [], since, ME, { comments: [again.id] })).reply_count).toBe(1);
    await query("UPDATE posts SET is_blinded = true WHERE id = $1", [post.id]);
    expect((await watchUpdates([], [], since, ME, { comments: [again.id] })).reply_count).toBe(0);
  });

  it("header badge and report include replies", async () => {
    const post = await newPost(OTHER, "비타민 D 흡수율");
    const mine = await say(post.id, ME, "나나", "첫 댓글");
    const since = new Date();
    await new Promise((r) => setTimeout(r, 10));
    await say(post.id, OTHER, "작성자", "답글입니다", mine.id);
    expect(await report.countNew([], since, { products: [], posts: [], comments: [mine.id], fingerprint: ME })).toBe(1);
    const r = await report.buildReport([], since, new Date(), { products: [], posts: [], comments: [mine.id], fingerprint: ME });
    expect(r.watch).toMatchObject({ reply_count: 1, replies: [{ kind: "reply", excerpt: "답글입니다" }] });
  });

  it("push: my comment ids are stored with the subscription and replies are sent", async () => {
    const post = await newPost(OTHER, "비타민 D 흡수율");
    const mine = await say(post.id, ME, "나나", "첫 댓글");
    const endpoint = "https://fcm.googleapis.com/fcm/send/replies-1";
    const { token } = await push.subscribe(
      { endpoint, p256dh: "p".repeat(20), auth: "a".repeat(10) },
      { products: [], posts: [], comments: [mine.id, "x", mine.id] },
      ME,
    );
    expect((await query<{ comments: string[] }>("SELECT comments::text[] FROM push_subscriptions"))[0]!.comments).toEqual([mine.id]);
    const sent: { body: string; url: string }[] = [];
    const send = async (_s: unknown, m: { body: string; url: string }) => (sent.push(m), "sent" as const);
    expect(await runPushBatch(new Date(), { send })).toMatchObject({ checked: 1, sent: 0 });
    const reply = await say(post.id, OTHER, "작성자", "좋은 지적이에요", mine.id);
    expect(await runPushBatch(new Date(), { send })).toMatchObject({ sent: 1 });
    expect(sent).toEqual([{ body: "💬 작성자님이 답글: 좋은 지적이에요", url: `/posts/${post.id}#c${reply.id}`, title: "라벨공화국 · 비타민 D 흡수율", tag: "lr-watch" }]);
    // 목록을 비우면 알림 대상에서 빠진다
    await push.updateWatch(endpoint, token, { products: [], posts: [] });
    expect((await query<{ comments: string[] }>("SELECT comments::text[] FROM push_subscriptions"))[0]!.comments).toEqual([]);
  });
});
