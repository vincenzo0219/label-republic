import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const vapid = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
process.env.VAPID_PRIVATE_KEY = vapid.privateKey;

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("🎫 room event push (10/21)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const push = await import("@/lib/repo/push");
  const posts = await import("@/lib/repo/posts");
  const { runEventPush, eventPushMessage } = await import("@/lib/jobs/push");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });
  const newPost = (title: string, categorySlug = "supplements") =>
    posts.createPost({
      categorySlug,
      nickname: "노방장",
      pin: "1234",
      title,
      body: "행사 일정 본문입니다. 공식 안내를 확인하세요.",
      summary: { lines: ["하나", "둘", "셋"], model: "author", isAuthorEdited: true },
      fingerprint: "e".repeat(64),
    });

  it("sends new [행사] posts of the rooms a subscriber turned on, once, only in the daytime", async () => {
    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/event-1", p256dh: "p".repeat(20), auth: "a".repeat(16) };
    const { token } = await push.subscribe(sub, { products: [], posts: [] }, "f".repeat(64));
    expect(await push.setEventRoom(sub.endpoint, token, "supplements", true)).toEqual(["supplements"]);
    await expect(push.setEventRoom(sub.endpoint, "x".repeat(20), "supplements", true)).rejects.toBeTruthy();

    const p = await newPost("[행사] 영양제 박람회 · 11/1(토) 코엑스");
    await newPost("그냥 수다 글");
    const other = (await query<{ slug: string }>("SELECT slug FROM categories WHERE slug <> 'supplements' AND slug <> '전체' LIMIT 1"))[0]!.slug;
    await newPost("[행사] 다른 방 행사", other);

    const sent: { title: string; body: string; url: string }[] = [];
    const send = async (_s: unknown, m: { title: string; body: string; url: string }) => (sent.push(m), "sent" as const);
    const later = new Date(Date.now() + 60_000);
    const kstHour = (later.getUTCHours() + 9) % 24;
    if (kstHour < 8 || kstHour >= 22) {
      expect((await runEventPush(later, { send })).ran).toBe(false);
      return;
    }
    expect(await runEventPush(later, { send })).toMatchObject({ ran: true, sent: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body).toBe("영양제 박람회 · 11/1(토) 코엑스");
    expect(sent[0]!.url).toBe(`/posts/${p.id}?from=push`);
    // 같은 행사는 다시 보내지 않는다
    expect(await runEventPush(new Date(later.getTime() + 60_000), { send })).toMatchObject({ sent: 0 });
    // 끄면 빠진다
    expect(await push.setEventRoom(sub.endpoint, token, "supplements", false)).toEqual([]);
  });

  it("names the room and the count in the message", () => {
    const m = eventPushMessage([{ id: "9", title: "[행사] AGF 2026", room: "애니·만화 덕후방" }, { id: "8", title: "[행사] 코믹월드", room: "애니·만화 덕후방" }]);
    expect(m).toMatchObject({ title: "🎫 애니·만화 덕후방 새 행사 2건", body: "AGF 2026", url: "/posts/9?from=push" });
  });

  it("refuses night pushes (KST 22~8)", async () => {
    expect((await runEventPush(new Date("2026-10-21T14:00:00Z"))).ran).toBe(false); // 23:00 KST
    expect((await runEventPush(new Date("2026-10-21T22:30:00Z"))).ran).toBe(false); // 07:30 KST
  });
});
