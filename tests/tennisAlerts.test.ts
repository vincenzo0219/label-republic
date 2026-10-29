import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import webpush from "web-push";
import { courtOpenDue, courtOpenMessage, matchesTennisSub, nextOpenDay, openRuleLabel, tennisGameMessage, type GameAlertLine } from "@/lib/tennisAlerts";

const vapid = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
process.env.VAPID_PRIVATE_KEY = vapid.privateKey;

const kst = (ymdhm: string) => new Date(`${ymdhm}:00+09:00`);

describe("🔔 코트 예약 오픈 날짜", () => {
  it("그날 포함 가장 가까운 오픈일, 달 넘어가기", () => {
    expect(nextOpenDay([10, 25], "2026-10-10")).toBe("2026-10-10");
    expect(nextOpenDay([10, 25], "2026-10-11")).toBe("2026-10-25");
    expect(nextOpenDay([25, 10], "2026-10-26")).toBe("2026-11-10");
    expect(nextOpenDay([10, 25], "2026-12-26")).toBe("2027-01-10");
  });
  it("그 달에 없는 날은 그달 건너뛴다 (31일·2월 30일)", () => {
    expect(nextOpenDay([31], "2026-11-01")).toBe("2026-12-31");
    expect(nextOpenDay([30], "2027-02-01")).toBe("2027-03-30");
    expect(nextOpenDay([29], "2028-02-01")).toBe("2028-02-29");
    expect(nextOpenDay([], "2026-10-01")).toBeNull();
  });
  it("보낼 때: 전날 20시, 당일 오픈 시각(모르면 9시), 밤 10시 넘으면 안 보냄 (KST)", () => {
    const c = { open_days: [10, 25], open_time: "" };
    expect(courtOpenDue(c, kst("2026-11-09T19:59"))).toBeNull();
    expect(courtOpenDue(c, kst("2026-11-09T20:00"))).toEqual({ kind: "eve", openDay: "2026-11-10" });
    expect(courtOpenDue(c, kst("2026-11-10T08:59"))).toBeNull();
    expect(courtOpenDue(c, kst("2026-11-10T09:00"))).toEqual({ kind: "day", openDay: "2026-11-10" });
    expect(courtOpenDue(c, kst("2026-11-10T22:30"))).toBeNull();
    // UTC 로는 전날이어도 KST 날짜로 판단
    expect(courtOpenDue({ open_days: [1], open_time: "06:00" }, new Date("2026-10-31T21:30:00Z"))).toEqual({ kind: "day", openDay: "2026-11-01" });
    expect(courtOpenDue({ open_days: [1], open_time: "" }, kst("2026-10-31T21:00"))).toEqual({ kind: "eve", openDay: "2026-11-01" });
  });
  it("문구와 다음 오픈 D-day", () => {
    const c = { id: 1, court: "가좌테니스장", open_time: "", booking_url: "https://yeyak.seoul.go.kr", open_days: [10, 25] };
    expect(courtOpenMessage(c, "eve", "2026-11-10").title).toBe("🔔 내일(11/10) 가좌테니스장 예약 오픈");
    expect(courtOpenMessage(c, "day", "2026-11-10").url).toBe("https://yeyak.seoul.go.kr");
    expect(openRuleLabel(c, kst("2026-10-29T12:00"))).toBe("매달 10·25일 · 다음 11/10 (D-12)");
    expect(openRuleLabel(c, kst("2026-11-10T12:00"))).toBe("매달 10·25일 · 다음 11/10 (오늘)");
  });
});

describe("🔔 우리 동네 새 게임 맞춤", () => {
  const g: GameAlertLine = { id: "7", sido: "경기", sigungu: "용인시", court: "용인베스트 실내", play_date: "2026-10-31", start_time: "10:00", game_type: "남복" };
  it("지역(시·도 또는 시·군·구)과 종목", () => {
    expect(matchesTennisSub(g, { areas: ["경기"], types: [] })).toBe(true);
    expect(matchesTennisSub(g, { areas: ["경기 용인시"], types: ["남복"] })).toBe(true);
    expect(matchesTennisSub(g, { areas: ["경기 수원시"], types: [] })).toBe(false);
    expect(matchesTennisSub(g, { areas: ["경기"], types: ["여복"] })).toBe(false);
  });
  it("한 건이면 그 게임으로, 여러 건이면 게시판으로", () => {
    expect(tennisGameMessage([g])).toMatchObject({ title: "🎾 새 게임 · 용인시", body: "10/31 10:00 · 용인베스트 실내 · 남복" });
    expect(tennisGameMessage([g]).url).toMatch(/\?tab=games#game-7$/);
    expect(tennisGameMessage([g, { ...g, id: "8" }]).title).toBe("🎾 우리 동네 새 게임 2건");
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("🔔 테니스 알림 (DB)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const push = await import("@/lib/repo/push");
  const games = await import("@/lib/repo/tennisGames");
  const alerts = await import("@/lib/repo/tennisAlerts");
  const { runTennisPush } = await import("@/lib/jobs/tennisPush");
  const admin = await import("@/app/api/admin/court-opens/route");
  const ctx = { params: Promise.resolve({}) };
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  const base = (over: Record<string, unknown> = {}) => ({
    nickname: "테스트러", pw: "1234", sido: "부산", sigungu: "", court: "을숙도 4번", date: "2026-10-31", start: "08:00", end: "10:00", type: "남복" as const, needM: 2, ...over,
  });

  it("고른 지역·종목 새 게임만, 내 게임은 빼고, 15분 간격·하루 한도", async () => {
    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/tennis-1", p256dh: "r".repeat(20), auth: "c".repeat(16) };
    const mine = "a".repeat(64);
    const { token } = await push.subscribe(sub, { products: [], posts: [] }, mine);
    const t0 = new Date("2026-10-28T02:00:00Z"); // 11:00 KST
    expect(await alerts.setTennisAlert(sub.endpoint, token, ["부산", "없는곳"], ["남복", "농구"], t0)).toEqual({ areas: ["부산"], types: ["남복"] });
    expect(await alerts.getTennisAlert(sub.endpoint, token)).toEqual({ areas: ["부산"], types: ["남복"] });
    const sent: { title: string; url: string }[] = [];
    const send = async (_s: unknown, m: { title: string; url: string }) => (sent.push(m), "sent" as const);
    const at = (min: number) => new Date(t0.getTime() + min * 60_000);
    const other = { fingerprint: "b".repeat(64), net: null };
    const a = await games.createGame(base(), other, at(1));
    await games.createGame(base({ court: "사직실내", type: "여복", needM: 0, needF: 2 }), other, at(1)); // 종목 다름
    await games.createGame(base({ sido: "서울", court: "관악" }), other, at(1)); // 지역 다름
    await games.createGame(base({ court: "내가 올림" }), { fingerprint: mine, net: null }, at(1)); // 내 게임
    expect((await runTennisPush(at(2), { send })).games).toBe(0); // 2분 안 됨
    expect((await runTennisPush(at(4), { send })).games).toBe(1);
    expect(sent[0]!.url).toMatch(new RegExp(`#game-${a.id}$`));
    await games.createGame(base({ court: "두번째" }), other, at(5));
    expect((await runTennisPush(at(10), { send })).games).toBe(0); // 15분 간격
    expect((await runTennisPush(at(20), { send })).games).toBe(1);
    expect(sent[1]!.title).toBe("🎾 새 게임 · 부산");
    // 밤 11시에는 안 보낸다
    await games.createGame(base({ court: "밤코트", date: "2026-11-01" }), other, new Date("2026-10-28T14:00:00Z"));
    expect((await runTennisPush(new Date("2026-10-28T14:30:00Z"), { send })).games).toBe(0);
    // 하루 한도
    await query("UPDATE tennis_alert_subs SET sent_today = 10, sent_day = '2026-10-29', last_sent_at = NULL");
    await games.createGame(base({ court: "한도코트", date: "2026-11-02" }), other, new Date("2026-10-28T23:00:00Z"));
    expect((await runTennisPush(new Date("2026-10-28T23:30:00Z"), { send })).games).toBe(0);
    // 끄기
    expect(await alerts.setTennisAlert(sub.endpoint, token, [], [])).toBeNull();
  });

  it("운영자 규칙(PUT·GET·DELETE)과 코트 오픈 알림 한 번씩", async () => {
    const req = (method: string, body?: unknown) =>
      new Request("http://localhost/api/admin/court-opens", { method, headers: { "content-type": "application/json", origin: "http://localhost" }, body: body ? JSON.stringify(body) : undefined });
    const seeded = (await (await admin.GET(req("GET"), ctx)).json()) as { courts: { court: string; active: boolean }[] };
    expect(seeded.courts.map((c) => [c.court, c.active])).toEqual([["용인시 통합예약 테니스장", false], ["가좌테니스장", true]]);
    expect((await admin.PUT(req("PUT", { court: "테스트코트", sido: "서울", open_days: [31], booking_url: "https://x.example", source_url: "http://bad", last_verified: "2026-10-29" }), ctx)).status).toBe(400);
    const put = await admin.PUT(req("PUT", { court: "테스트코트", sido: "서울", open_days: [15, 1, 15], open_time: "10:00", booking_url: "https://x.example", source_url: "https://x.example/notice", last_verified: "2026-10-29" }), ctx);
    const { court } = (await put.json()) as { court: { id: number; open_days: number[] } };
    expect(court.open_days).toEqual([1, 15]);
    expect((await alerts.listCourtOpens()).map((c) => c.court)).toEqual(["가좌테니스장", "테스트코트"]);

    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/court-1", p256dh: "r".repeat(20), auth: "c".repeat(16) };
    const { token } = await push.subscribe(sub, { products: [], posts: [] }, "c".repeat(64));
    expect(await alerts.setCourtSub(sub.endpoint, token, court.id, true)).toEqual([court.id]);
    const off = (await alerts.listCourtOpens({ all: true })).find((c) => !c.active)!;
    await expect(alerts.setCourtSub(sub.endpoint, token, off.id, true)).rejects.toMatchObject({ status: 404 });
    const sent: string[] = [];
    const send = async (_s: unknown, m: { title: string }) => (sent.push(m.title), "sent" as const);
    expect((await runTennisPush(kst("2026-11-14T20:05"), { send })).courts).toBe(1);
    expect((await runTennisPush(kst("2026-11-14T20:06"), { send })).courts).toBe(0); // 한 번만
    expect((await runTennisPush(kst("2026-11-15T09:30"), { send })).courts).toBe(0); // 10시 전
    expect((await runTennisPush(kst("2026-11-15T10:00"), { send })).courts).toBe(1);
    expect(sent).toEqual(["🔔 내일(11/15) 테스트코트 예약 오픈", "🎾 오늘 테스트코트 예약 오픈"]);
    expect(await alerts.setCourtSub(sub.endpoint, token, court.id, false)).toEqual([]);
    expect((await admin.DELETE(req("DELETE", { id: court.id }), ctx)).status).toBe(200);
  });
});
