import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// 푸시 설정은 config 를 처음 읽기 전에
const vapid = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
process.env.VAPID_PRIVATE_KEY = vapid.privateKey;

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("daily push (Sprint 70)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const push = await import("@/lib/repo/push");
  const { runDailyPush, dailyPushMessage, runPushBatch } = await import("@/lib/jobs/push");
  const sub = (n: number) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/daily-${n}`, p256dh: "p".repeat(20), auth: "a".repeat(16) });
  const empty = { products: [], posts: [] };
  // 10/20 09:00 KST = 00:00Z, 07:00 KST = 22:00Z 전날
  const morning = new Date("2026-10-20T00:00:00Z");

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  beforeEach(async () => {
    await query("TRUNCATE push_subscriptions, push_runs RESTART IDENTITY CASCADE");
  });
  afterAll(async () => {
    await pool().end();
  });

  it("sends once a day after 8am KST to daily subscribers only", async () => {
    const t1 = await push.subscribe(sub(1), empty, "f".repeat(64), undefined, true);
    await push.subscribe(sub(2), empty, "f".repeat(64));
    const sent: string[] = [];
    const send = async (s: { endpoint: string }) => (sent.push(s.endpoint), "sent" as const);

    expect(await runDailyPush(new Date("2026-10-19T22:00:00Z"), { send })).toMatchObject({ ran: false });
    expect(await runDailyPush(morning, { send })).toMatchObject({ ran: true, sent: 1 });
    expect(sent).toEqual([sub(1).endpoint]);
    expect(await runDailyPush(new Date("2026-10-20T05:00:00Z"), { send })).toMatchObject({ sent: 0 });
    expect(await runDailyPush(new Date("2026-10-21T00:00:00Z"), { send })).toMatchObject({ sent: 1 });

    // 다시 켜거나 목록을 맞춰도 daily 는 그대로, 명시하면 바뀐다
    await push.subscribe(sub(1), empty, "f".repeat(64), t1.token);
    await push.updateWatch(sub(1).endpoint, t1.token, empty);
    expect((await query<{ daily: boolean }>("SELECT daily FROM push_subscriptions WHERE endpoint = $1", [sub(1).endpoint]))[0]!.daily).toBe(true);
    await push.updateWatch(sub(1).endpoint, t1.token, empty, false);
    expect((await query<{ daily: boolean }>("SELECT daily FROM push_subscriptions WHERE endpoint = $1", [sub(1).endpoint]))[0]!.daily).toBe(false);

    // 일반 배치는 관심 목록이 빈 daily 구독을 건드리지 않는다
    expect(await runPushBatch(morning, { send })).toMatchObject({ checked: 0 });
  });

  it("drops gone subscriptions", async () => {
    await push.subscribe(sub(3), empty, "f".repeat(64), undefined, true);
    expect(await runDailyPush(morning, { send: async () => "gone" })).toMatchObject({ removed: 1 });
    expect(await query("SELECT 1 FROM push_subscriptions")).toHaveLength(0);
  });

  it("links to the daily page with today's first line", () => {
    const m = dailyPushMessage("2026-10-20");
    expect(m.url).toBe("/daily?from=push");
    expect(m.title).toBe("📅 오늘의 문제 #6");
  });
});
