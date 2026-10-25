import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const vapid = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
process.env.VAPID_PRIVATE_KEY = vapid.privateKey;

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("🆕 내 방 새 글 push (10/25)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const push = await import("@/lib/repo/push");
  const { runRoomPush, ROOM_DAILY_MAX } = await import("@/lib/jobs/roomPush");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  // 2026-10-26(월) 12:00 KST
  const T = new Date("2026-10-26T03:00:00Z");
  const at = (min: number) => new Date(T.getTime() + min * 60_000);
  const ME = "f".repeat(64);
  const OTHER = "o".repeat(64);
  const ins = (slug: string, title: string, min: number, extra: { by?: string; fp?: string | null; type?: string } = {}) =>
    query<{ id: string }>(
      `INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type, moderated_by, author_fingerprint, created_at)
       SELECT id, 'n', 'x', $2, 'b', $3::post_type, $4, $5, $6 FROM categories WHERE slug = $1 RETURNING id::text`,
      [slug, title, extra.type ?? "info", extra.by ?? "", extra.fp === undefined ? OTHER : extra.fp, at(min).toISOString()],
    ).then((r) => r[0]!.id);

  it("sends one push per room per 6 hours, at most 3 a day, skipping automated posts and my own", async () => {
    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/room-1", p256dh: "p".repeat(20), auth: "a".repeat(16) };
    const { token } = await push.subscribe(sub, { products: [], posts: [] }, ME);
    await expect(push.setRoomAlerts(sub.endpoint, "x".repeat(20), true, ["supplements"])).rejects.toBeTruthy();
    expect(await push.setRoomAlerts(sub.endpoint, token, true, ["supplements", "keyboards", "bad slug!"])).toEqual({ on: true, rooms: ["supplements", "keyboards"] });
    await query("UPDATE push_subscriptions SET room_checked_until = $1", [at(-60).toISOString()]);

    await ins("supplements", "🗳 오늘의 질문 A vs B", -10, { by: "room-poll", type: "chat" });
    await ins("supplements", "💬 수다방", -9, { by: "room-chat", type: "chat" });
    await ins("supplements", "내가 쓴 글", -5, { fp: ME });
    const human = await ins("supplements", "마그네슘 뭐 드세요?", -20, { type: "chat" });
    const op = await ins("keyboards", "노방장 상식: 기계식 스위치는 세 종류로 나뉘어요", -15, { fp: null });
    await ins("keyboards", "방금 올린 글 (AI 운영 확인 전)", 0);

    const sent: { endpoint: string; title: string; url: string }[] = [];
    const send = async (s: { endpoint: string }, m: { title: string; url: string }) => (sent.push({ endpoint: s.endpoint, ...m }), "sent" as const);

    // 한 번에 한 통: 가장 최근 글(운영 글)부터, 다른 방은 다음 차례에
    expect(await runRoomPush(T, { send })).toMatchObject({ ran: true, sent: 1 });
    expect(sent[0]!.url).toBe(`/posts/${op}?from=push`);
    expect(sent[0]!.title).toMatch(/^🆕 .+ 새 글: 노방장 상식/);
    expect(await runRoomPush(at(10), { send })).toMatchObject({ sent: 1 });
    expect(sent[1]!.url).toBe(`/posts/${human}?from=push`);
    expect(await runRoomPush(at(20), { send })).toMatchObject({ sent: 0 });

    // 같은 방 새 글이 와도 6시간 안에는 다시 안 보낸다
    await ins("supplements", "두 번째 사람 글", 25);
    expect(await runRoomPush(at(40), { send })).toMatchObject({ sent: 0 });
    // 6시간 넘게 지나 새 글 → 그날 세 번째
    const third = await ins("supplements", "저녁 글", 6 * 60 + 15);
    expect(await runRoomPush(at(6 * 60 + 30), { send })).toMatchObject({ sent: 1 });
    expect(sent[2]!.url).toBe(`/posts/${third}?from=push`);
    expect(sent).toHaveLength(ROOM_DAILY_MAX);
    // 하루 3번을 채우면 다른 방이 6시간 지났어도 그날은 끝
    await ins("keyboards", "저녁 키보드 글", 6 * 60 + 40);
    expect(await runRoomPush(at(6 * 60 + 50), { send })).toMatchObject({ sent: 0 });
    // 밤에는 보내지 않는다 (KST 22시 넘음)
    expect((await runRoomPush(at(10 * 60 + 30), { send })).ran).toBe(false);

    // 끄면 방 목록도 지운다
    expect(await push.setRoomAlerts(sub.endpoint, token, false, ["supplements"])).toEqual({ on: false, rooms: [] });
    const [row] = await query<{ n: number }>("SELECT cardinality(my_rooms)::int AS n FROM push_subscriptions WHERE endpoint = $1", [sub.endpoint]);
    expect(row!.n).toBe(0);
  });

  it("drops a subscription the push service says is gone, and its send log with it", async () => {
    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/room-2", p256dh: "q".repeat(20), auth: "b".repeat(16) };
    const { token } = await push.subscribe(sub, { products: [], posts: [] }, "g".repeat(64));
    await push.setRoomAlerts(sub.endpoint, token, true, ["supplements"]);
    await query("UPDATE push_subscriptions SET room_checked_until = $2 WHERE endpoint = $1", [sub.endpoint, at(24 * 60).toISOString()]);
    await ins("supplements", "다음 날 글", 24 * 60 + 60);
    const r = await runRoomPush(at(24 * 60 + 70), { send: async () => "gone" as const });
    expect(r).toMatchObject({ ran: true, removed: 1 });
    expect(await query("SELECT 1 FROM push_subscriptions WHERE endpoint = $1", [sub.endpoint])).toHaveLength(0);
  });
});
