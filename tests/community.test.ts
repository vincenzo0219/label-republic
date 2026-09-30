import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPostSchema } from "@/lib/validation";

describe("post type validation", () => {
  const base = { category: "supplements", nickname: "닉네임", pw: "1234", title: "제목입니다", body: "본문은 열 글자 이상입니다." };
  it("requires choosing a post type", () => {
    expect(createPostSchema.safeParse(base).success).toBe(false);
    expect(createPostSchema.safeParse({ ...base, postType: "chat" }).success).toBe(true);
    expect(createPostSchema.safeParse({ ...base, postType: "rant" }).success).toBe(false);
  });
  it("validates meetup fields", () => {
    const meetup = { meetAt: "2099-01-01T10:00:00Z", location: "강남역", minParticipants: 3, capacity: 8 };
    expect(createPostSchema.safeParse({ ...base, postType: "meetup", meetup }).success).toBe(true);
    expect(createPostSchema.safeParse({ ...base, postType: "meetup", meetup: { ...meetup, minParticipants: 1 } }).success).toBe(false);
    expect(createPostSchema.safeParse({ ...base, postType: "meetup", meetup: { ...meetup, capacity: 500 } }).success).toBe(false);
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("chat tag and meetups (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const posts = await import("@/lib/repo/posts");
  const meetups = await import("@/lib/repo/meetups");
  const { runTrustBatch } = await import("@/lib/jobs/trust");
  const { runCuratorBatch } = await import("@/lib/jobs/curator");

  const fp = (n: number | string) => String(n).padStart(64, "0");
  const inDays = (n: number) => new Date(Date.now() + n * 86400_000).toISOString();
  const create = (opts: { type?: "info" | "chat" | "meetup"; title?: string; nickname?: string; fp?: string; meetup?: Partial<import("@/lib/repo/meetups").MeetupInput>; category?: string }) =>
    posts.createPost({
      categorySlug: opts.category ?? "keyboards",
      nickname: opts.nickname ?? "타건러",
      pin: "1234",
      title: opts.title ?? "테스트 글",
      body: "저소음 적축 45gf 스위치 이야기입니다.",
      summary: { lines: ["하나", "둘", "셋"], model: "author", isAuthorEdited: true },
      fingerprint: opts.fp ?? fp("author"),
      postType: opts.type,
      meetup:
        opts.type === "meetup"
          ? { meetAt: inDays(3), location: "강남역 카페", minParticipants: 3, capacity: 4, ...opts.meetup }
          : undefined,
    });

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
    await query("TRUNCATE posts, fingerprints, curator_queue, curator_runs RESTART IDENTITY CASCADE");
  });

  afterAll(async () => {
    await pool().end();
  });

  it("keeps chat posts out of trust badges and below info posts in trust order only", async () => {
    const info = await create({ title: "정보 글" });
    const chat = await create({ type: "chat", title: "잡담 글" });
    expect(chat).toMatchObject({ post_type: "chat", trust_tier: "none" });
    expect(info.trust_tier).toBe("pending");

    await query("UPDATE posts SET created_at = now() - interval '2 days'");
    for (let n = 1; n <= 10; n++) await posts.votePost(chat.id, fp(n), 1);
    await runTrustBatch();
    expect((await posts.getPost(chat.id))!.trust_tier).toBe("none");

    // 잡담이 추천이 훨씬 많아도 신뢰도순에서는 정보 글 아래
    expect((await posts.listPosts({ sort: "trust" })).items.map((p) => p.title)).toEqual(["정보 글", "잡담 글"]);
    // 추천순은 유형과 무관
    expect((await posts.listPosts({ sort: "votes" })).items.map((p) => p.title)).toEqual(["잡담 글", "정보 글"]);
    expect((await posts.listPosts({ sort: "latest", type: "chat" })).items.map((p) => p.id)).toEqual([chat.id]);
    expect((await posts.listPostIdsForSitemap()).map((r) => r.id)).toEqual([info.id]);
  });

  it("does not let meetups outrank pending info posts in trust order", async () => {
    const info = await create({ title: "새 정보 글" });
    await create({ type: "meetup", title: "정모" });
    await query("UPDATE posts SET created_at = now() - interval '1 hour' WHERE id = $1", [info.id]);
    // 정모가 더 최신이라 같은 "검증 대기" 자리에서 앞에 오지만, 순추천이 높은 정보 글보다는 뒤
    for (let n = 1; n <= 2; n++) await posts.votePost(info.id, fp(n), 1);
    expect((await posts.listPosts({ sort: "trust" })).items.map((p) => p.title)).toEqual(["새 정보 글", "정모"]);
  });

  it("creates a meetup with the proposer as the first participant", async () => {
    const m = await create({ type: "meetup", title: "강남 타건 모임" });
    expect(m.post_type).toBe("meetup");
    expect(m.meetup).toMatchObject({ location: "강남역 카페", min_participants: 3, capacity: 4, rsvp_count: 1, status: "proposed" });
    expect(await meetups.listParticipants(m.id)).toEqual(["타건러"]);
    expect(m.trust_tier).toBe("none");
  });

  it("rejects meetups in the past, too far out, or with capacity below the threshold", async () => {
    await expect(create({ type: "meetup", meetup: { meetAt: inDays(-1) } })).rejects.toMatchObject({ status: 400 });
    await expect(create({ type: "meetup", meetup: { meetAt: inDays(120) } })).rejects.toMatchObject({ status: 400 });
    await expect(create({ type: "meetup", meetup: { minParticipants: 5, capacity: 3 } })).rejects.toMatchObject({ status: 400 });
    expect((await posts.listPosts({ sort: "latest" })).total).toBe(0); // 트랜잭션 롤백
  });

  it("auto-confirms exactly once when RSVPs reach the threshold, even concurrently", async () => {
    const m = await create({ type: "meetup", meetup: { minParticipants: 3, capacity: 10 } });
    const results = await Promise.all([fp(1), fp(2), fp(3), fp(4)].map((f, i) => meetups.toggleRsvp(m.id, f, `참가자${i}`)));
    expect(results.filter((r) => r.justConfirmed)).toHaveLength(1);
    const after = await posts.getPost(m.id);
    expect(after!.meetup).toMatchObject({ status: "confirmed", rsvp_count: 5 });
    expect(after!.meetup!.confirmed_at).toBeTruthy();
  });

  it("toggles attendance, enforces capacity, and keeps a confirmed meetup confirmed", async () => {
    const m = await create({ type: "meetup", meetup: { minParticipants: 2, capacity: 3 } });
    expect(await meetups.toggleRsvp(m.id, fp(1), "하나")).toMatchObject({ attending: true, justConfirmed: true });
    expect(await meetups.toggleRsvp(m.id, fp(2), "둘")).toMatchObject({ attending: true, justConfirmed: false });
    await expect(meetups.toggleRsvp(m.id, fp(3), "셋")).rejects.toMatchObject({ status: 409 });
    const left = await meetups.toggleRsvp(m.id, fp(1), "하나");
    expect(left).toMatchObject({ attending: false, meetup: { rsvp_count: 2, status: "confirmed" } });
    expect(await meetups.isAttending(m.id, fp(1))).toBe(false);
  });

  it("closes RSVPs after the meetup time and expires unconfirmed ones in maintenance", async () => {
    const m = await create({ type: "meetup" });
    await query("UPDATE meetups SET meet_at = now() - interval '1 hour' WHERE post_id = $1", [m.id]);
    await expect(meetups.toggleRsvp(m.id, fp(9), "늦은이")).rejects.toMatchObject({ status: 410 });
    const client = await pool().connect();
    try {
      expect(await meetups.expireMeetups(client)).toBe(1);
      expect(await meetups.expireMeetups(client)).toBe(0);
    } finally {
      client.release();
    }
    expect((await posts.getPost(m.id))!.meetup!.status).toBe("expired");
  });

  it("caps consecutive proposals by the same person, by nickname or fingerprint", async () => {
    await create({ type: "meetup", nickname: "주최왕", fp: fp("host") });
    await create({ type: "meetup", nickname: "주최왕", fp: fp("host") });
    // 같은 닉네임
    await expect(create({ type: "meetup", nickname: "주최왕", fp: fp("other-device") })).rejects.toMatchObject({ status: 409, code: "meetup_consecutive_limit" });
    // 닉네임만 바꿔도 같은 fingerprint면 차단
    await expect(create({ type: "meetup", nickname: "새닉네임", fp: fp("host") })).rejects.toMatchObject({ status: 409 });
    // 다른 보드는 별개
    await create({ type: "meetup", nickname: "주최왕", fp: fp("host"), category: "deskterior" });
    // 다른 사람이 제안하면 다시 가능
    await create({ type: "meetup", nickname: "다른사람", fp: fp("someone") });
    await create({ type: "meetup", nickname: "주최왕", fp: fp("host") });
    // 일반 글은 제한과 무관
    await create({ type: "chat", nickname: "주최왕", fp: fp("host") });
  });

  it("counts only human info posts when the AI curator decides to retreat", async () => {
    for (let i = 0; i < 25; i++) await create({ type: "chat", title: `잡담 ${i}` });
    const r = await runCuratorBatch();
    expect(r.categories.find((c) => c.slug === "keyboards")).toMatchObject({ human: 0, intervalHours: 12 });
  });
});
