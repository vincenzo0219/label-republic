import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("🎉 덕질 기념일 카드 · 💪 응원 카드 · 📅 달력 구독 (DB)", async () => {
  process.env.DATABASE_URL = url;
  process.env.SITE_URL = "https://nobangjang.com";
  const { pool, query } = await import("@/lib/db");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const { fingerprint } = await import("@/lib/fingerprint");
  const { kstDay } = await import("@/lib/metrics");
  const cards = await import("@/lib/repo/cards");
  const posts = await import("@/lib/repo/posts");
  const { peopleReactions } = await import("@/lib/repo/metrics");
  const { calendarPosts, calendarFetchStats } = await import("@/lib/repo/roomCalendar");
  const { runCheerPush } = await import("@/lib/jobs/cheerPush");
  const fanRoute = await import("@/app/api/cards/fanday/route");
  const cheerRoute = await import("@/app/api/cards/[id]/cheer/route");
  const adminRoute = await import("@/app/api/admin/cheer-cards/route");
  const calRoute = await import("@/app/cal/rooms.ics/route");

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
    await resetRateLimits();
    await query(
      `INSERT INTO categories (slug, name, description, is_hidden, info_only) VALUES
         ('러닝-덕후방', '러닝 덕후방', '', false, false), ('숨은방', '숨은 방', '', true, false), ('정보방', '정보 방', '', false, true)`,
    );
  }, 60_000);
  afterAll(async () => {
    await pool().end();
  });

  const headers = (ip: string, cookie?: string) => ({
    "Content-Type": "application/json",
    "x-labelrep-client-ip": ip,
    "user-agent": "test",
    ...(cookie ? { cookie } : {}),
  });
  const post = (u: string, body: unknown, ip = "203.0.113.9", cookie?: string) =>
    new Request(`http://localhost${u}`, { method: "POST", headers: headers(ip, cookie), body: JSON.stringify(body) });
  const ctx = <P>(p: P) => ({ params: Promise.resolve(p) });
  const noCtx = { params: Promise.resolve({}) } as never;
  const vid = (n: number) => `lr_vid=${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;

  let cardId = "";

  it("creates an anniversary card from presets only (no date, no free text) and locks editing", async () => {
    const res = await fanRoute.POST(post("/api/cards/fanday", { room: "러닝-덕후방", preset: "start", occasion: { unit: "days", n: 100 }, nickname: "하늘하늘", pw: "1234" }), noCtx);
    expect(res.status).toBe(201);
    const { card } = (await res.json()) as { card: { id: string; title: string } };
    cardId = card.id;
    expect(card.title).toBe("[자랑] 🎉 하늘하늘님 러닝 시작 100일째");
    const p = await posts.getPost(card.id);
    expect(p).toMatchObject({ card_kind: "fanday", cheer_count: 0, post_type: "chat" });
    expect(p!.body).toBe("오늘은 하늘하늘님의 러닝 시작 100일째예요.\n🎉 축하해요 버튼으로 같이 축하해 주세요.");
    await expect(posts.updatePost(card.id, "x", "1234", { title: "아무 말" })).rejects.toMatchObject({ status: 403, code: "card_locked" });
    // 날짜·자유 글은 받지 않는다
    const bad = await fanRoute.POST(post("/api/cards/fanday", { room: "러닝-덕후방", preset: "etc", occasion: { unit: "days", n: 1 }, nickname: "하늘", pw: "1234" }, "203.0.113.50"), noCtx);
    expect(bad.status).toBe(400);
  });

  it("allows one card per device per room per day, and none in hidden or info-only rooms", async () => {
    const again = await fanRoute.POST(post("/api/cards/fanday", { room: "러닝-덕후방", preset: "ipduk", occasion: { unit: "days", n: 3 }, nickname: "하늘하늘", pw: "1234" }), noCtx);
    expect(again.status).toBe(429);
    for (const room of ["숨은방", "정보방"]) {
      const r = await fanRoute.POST(post("/api/cards/fanday", { room, preset: "ipduk", occasion: { unit: "days", n: 3 }, nickname: "하늘하늘", pw: "1234" }, "203.0.113.10"), noCtx);
      expect(r.status).toBe(400);
    }
    // 운영자 사칭 닉네임은 글과 같은 규칙으로 막힌다
    const op = await fanRoute.POST(post("/api/cards/fanday", { room: "러닝-덕후방", preset: "ipduk", occasion: { unit: "days", n: 3 }, nickname: "노방장", pw: "1234" }, "203.0.113.11"), noCtx);
    expect(op.status).toBe(400);
  });

  it("counts one 🎉 per visitor, never on ordinary posts", async () => {
    const tap = (n: number, ip = "198.51.100.1") => cheerRoute.POST(post(`/api/cards/${cardId}/cheer`, {}, ip, vid(n)), ctx({ id: cardId }));
    expect(await (await tap(1)).json()).toEqual({ cheers: 1 });
    expect(await (await tap(1)).json()).toEqual({ cheers: 1 });
    expect(await (await tap(2, "198.51.100.2")).json()).toEqual({ cheers: 2 });
    // 자기 카드(같은 기기)도 눌리긴 하지만 사람끼리 반응에는 안 센다
    expect(await (await tap(3, "203.0.113.9")).json()).toEqual({ cheers: 3 });
    const [plain] = await query<{ id: string }>(
      "INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type) VALUES (1, '민', 'x', '그냥 글', '본문입니다 열 글자', 'chat') RETURNING id::text",
    );
    const r = await cheerRoute.POST(post(`/api/cards/${plain!.id}/cheer`, {}, "198.51.100.1", vid(1)), ctx({ id: plain!.id }));
    expect(r.status).toBe(404);
    expect((await posts.getPost(cardId))!.cheer_count).toBe(3);
  });

  it("lets the operator create 💪 cheer cards; their taps are kept apart from person-to-person reactions", async () => {
    const res = await adminRoute.POST(post("/api/admin/cheer-cards", { room: "러닝-덕후방", title: "💪 오늘 춘천마라톤 뛰는 분들 응원해요" }), noCtx);
    expect(res.status).toBe(201);
    const { card } = (await res.json()) as { card: { id: string } };
    expect((await posts.getPost(card.id))).toMatchObject({ card_kind: "cheer", nickname: "노방장" });
    await cheerRoute.POST(post(`/api/cards/${card.id}/cheer`, {}, "198.51.100.1", vid(1)), ctx({ id: card.id }));
    const today = await cards.todayCards(["러닝-덕후방", "숨은방"]);
    expect(today.map((c) => [c.card_kind, c.cheers])).toEqual([["cheer", 1], ["fanday", 3]]);
    const [day] = await peopleReactions(kstDay(), 1);
    expect(day).toMatchObject({ cheers: 2, cheer_taps: 1 });
    // 사람↔사람 = 댓글 반응(0) + 🎉 축하(자기 것 빼고 2)
    expect(day!.h2h).toBe(2);
  });

  it("pushes the card owner at most once a day", async () => {
    const fp = fingerprint(new Headers(headers("203.0.113.9")));
    await query(
      "INSERT INTO push_subscriptions (endpoint, p256dh, auth, fingerprint, posts) VALUES ('https://fcm.googleapis.com/x', 'k', 'a', $1, $2::bigint[])",
      [fp, [cardId]],
    );
    // 남의 카드를 지켜보는 구독은 받지 않는다
    await query("INSERT INTO push_subscriptions (endpoint, p256dh, auth, fingerprint, posts) VALUES ('https://fcm.googleapis.com/y', 'k', 'a', $1, $2::bigint[])", ["f".repeat(64), [cardId]]);
    const sent: { endpoint: string; title: string }[] = [];
    const send = async (t: { endpoint: string }, m: { title: string }) => (sent.push({ endpoint: t.endpoint, title: m.title }), "sent" as const);
    const noon = new Date(`${kstDay()}T12:00:00+09:00`);
    expect(await runCheerPush(new Date(`${kstDay()}T22:00:00+09:00`), { send })).toEqual({ sent: 0, removed: 0 });
    expect(await runCheerPush(noon, { send })).toEqual({ sent: 1, removed: 0 });
    expect(sent).toEqual([{ endpoint: "https://fcm.googleapis.com/x", title: "🎉 3명이 내 기념일을 축하했어요" }]);
    await cheerRoute.POST(post(`/api/cards/${cardId}/cheer`, {}, "198.51.100.9", vid(9)), ctx({ id: cardId }));
    expect(await runCheerPush(new Date(noon.getTime() + 3600_000), { send })).toEqual({ sent: 0, removed: 0 });
  });

  it("serves the room calendar without hidden or info-only rooms and counts fetches anonymously", async () => {
    const ins = (slug: string, title: string) =>
      query("INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type) SELECT id, '운영', 'x', $2, '본문입니다 열 글자', 'chat' FROM categories WHERE slug = $1", [slug, title]);
    const next = new Date(Date.now() + 9 * 3600_000 + 10 * 86_400_000);
    const md = `${next.getUTCMonth() + 1}/${next.getUTCDate()}`;
    await ins("러닝-덕후방", `[행사] 런 페스티벌 · ${md} 여의도`);
    await ins("숨은방", `[행사] 숨은 행사 · ${md}`);
    await ins("정보방", `[행사] 정보방 행사 · ${md}`);
    expect((await calendarPosts(["러닝-덕후방", "숨은방", "정보방"])).map((p) => p.title)).toEqual([`[행사] 런 페스티벌 · ${md} 여의도`]);
    const res = await calRoute.GET(new Request(`http://localhost/cal/rooms.ics?r=${encodeURIComponent("러닝-덕후방")},숨은방`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("public, max-age=600");
    const body = (await res.text()).replace(/\r\n[ \t]/g, "");
    expect(body).toContain("SUMMARY:🎫 런 페스티벌 (러닝 덕후방)");
    expect(body).toContain("https://nobangjang.com/posts/");
    expect(body).not.toContain("숨은 행사");
    expect((await calRoute.GET(new Request("http://localhost/cal/rooms.ics"))).status).toBe(400);
    await new Promise((r) => setTimeout(r, 50));
    expect(await calendarFetchStats()).toEqual({ today: 1, week: 1, month: 1 });
  });
});
