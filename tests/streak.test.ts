import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const vapid = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
process.env.VAPID_PRIVATE_KEY = vapid.privateKey;

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("user states and streak push (Sprint 80)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const push = await import("@/lib/repo/push");
  const { runStreakPush, streakPushMessage } = await import("@/lib/jobs/push");
  const { userStates } = await import("@/lib/repo/metrics");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("splits visitors into new, current, reactivated and at-risk", async () => {
    const v = (c: string) => c.repeat(64);
    // a: 10/10 첫 방문, 10/18·10/19 방문 (19일엔 현재 사용자) · b: 10/18 첫 방문, 19일 안 옴 (위험) · c: 10/19 첫 방문 (새) · e: 10/10 첫 방문, 19일 다시 (돌아온)
    const first: Record<string, string> = { a: "2026-10-10", b: "2026-10-18", c: "2026-10-19", e: "2026-10-10" };
    for (const [k, f] of Object.entries(first))
      await query("INSERT INTO visitors (visitor_hash, first_seen, last_day) VALUES ($1, ($2::date + time '12:00') AT TIME ZONE 'Asia/Seoul', $2::date)", [v(k), f]);
    const views: [string, string][] = [["a", "2026-10-18"], ["a", "2026-10-19"], ["a", "2026-10-19"], ["b", "2026-10-18"], ["c", "2026-10-19"], ["e", "2026-10-19"]];
    for (const [k, day] of views)
      await query("INSERT INTO page_views (day, visitor_hash, is_returning, path, source, is_landing) VALUES ($1, $2, false, '/', 'direct', true)", [day, v(k)]);
    const [t, y] = await userStates("2026-10-19", 2);
    expect(t).toMatchObject({ day: "2026-10-19", active: 3, new_users: 1, current: 1, reactivated: 1, yesterday: 2, at_risk: 1, curr: 50 });
    expect(y).toMatchObject({ day: "2026-10-18", active: 2, new_users: 1, current: 0, reactivated: 1 });
  });

  it("counts streak days and reminds once in the evening before it breaks", async () => {
    const sub = (n: number) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/streak-${n}`, p256dh: "p".repeat(20), auth: "a".repeat(16) });
    const empty = { products: [], posts: [] };
    const t1 = await push.subscribe(sub(1), empty, "f".repeat(64));
    const t2 = await push.subscribe(sub(2), empty, "f".repeat(64));
    expect(await push.markActive(sub(1).endpoint, t1.token, "2026-10-17")).toBe(1);
    expect(await push.markActive(sub(1).endpoint, t1.token, "2026-10-18")).toBe(2);
    expect(await push.markActive(sub(1).endpoint, t1.token, "2026-10-18")).toBe(2);
    expect(await push.markActive(sub(2).endpoint, t2.token, "2026-10-18")).toBe(1);
    await expect(push.markActive(sub(2).endpoint, "x".repeat(20), "2026-10-18")).rejects.toBeTruthy();

    const sent: string[] = [];
    const send = async (s: { endpoint: string }, m: { title: string }) => (sent.push(`${s.endpoint.slice(-8)} ${m.title}`), "sent" as const);
    // 10/19 19:00 KST: 아직 이르다
    expect((await runStreakPush(new Date("2026-10-19T10:00:00Z"), { send })).ran).toBe(false);
    // 20:00 KST: 어제까지 2일 이어 온 1번만, 한 번
    expect(await runStreakPush(new Date("2026-10-19T11:00:00Z"), { send })).toMatchObject({ ran: true, sent: 1 });
    expect(await runStreakPush(new Date("2026-10-19T12:00:00Z"), { send })).toMatchObject({ sent: 0 });
    expect(sent).toEqual([`streak-1 ${streakPushMessage(2).title}`]);
    // 오늘 했으면 보내지 않는다
    await push.markActive(sub(1).endpoint, t1.token, "2026-10-19");
    expect(await runStreakPush(new Date("2026-10-20T11:00:00Z"), { send })).toMatchObject({ sent: 1 });
    expect(streakPushMessage(3).title).toBe("🔥 3일 연속 기록이 오늘 끊겨요");
  });
});
