import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const vapid = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
process.env.VAPID_PRIVATE_KEY = vapid.privateKey;

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

const DAY = 86_400_000;
/** 오늘(KST)부터 n일 뒤 'YYYY-MM-DD' */
const kday = (n: number) => new Date(Date.now() + 9 * 3600_000 + n * DAY).toISOString().slice(0, 10);
const fp = (c: string) => c.repeat(64);
const ROOM = "미혼남녀-만남-행사";

d("💌 미혼남녀 만남 행사 (DB): 정보만 보여 주는 방", async () => {
  process.env.DATABASE_URL = url;
  process.env.SITE_URL = "https://nobangjang.com";
  const { pool, query } = await import("@/lib/db");
  const posts = await import("@/lib/repo/posts");
  const comments = await import("@/lib/repo/comments");
  const eg = await import("@/lib/repo/eventGoing");
  const meetups = await import("@/lib/repo/meetups");
  const push = await import("@/lib/repo/push");
  const singles = await import("@/lib/repo/singlesEvents");
  const { listCategories, getCategoryBySlug } = await import("@/lib/repo/categories");
  const { runSinglesPush } = await import("@/lib/jobs/singlesPush");
  const { handleRpc } = await import("@/lib/mcp");
  const { resetRateLimits } = await import("@/lib/rate-limit");
  const postsRoute = await import("@/app/api/posts/route");
  const goingRoute = await import("@/app/api/posts/[id]/going/route");
  const commentsRoute = await import("@/app/api/posts/[id]/comments/route");
  const adminRoute = await import("@/app/api/admin/singles-events/route");
  const pushRoute = await import("@/app/api/push/singles/route");

  const dir = path.join(process.cwd(), "db", "migrations");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
    await resetRateLimits();
  });
  afterAll(async () => {
    await pool().end();
  });

  const json = (u: string, body: unknown) =>
    new Request(`http://localhost${u}`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.9" }, body: JSON.stringify(body) });

  it("092 adds the room only on the operating DB: hidden from room lists, low sort, info_only, reachable by slug", async () => {
    expect(await getCategoryBySlug(ROOM)).toBeNull();
    await query("INSERT INTO categories (slug, name, description) VALUES ('반려견-덕후방', '반려견', '') ON CONFLICT DO NOTHING");
    await query(readFileSync(path.join(dir, "092_singles_events.sql"), "utf8"));
    const room = await getCategoryBySlug(ROOM);
    expect(room).toMatchObject({ name: "💌 미혼남녀 만남 행사", description: "지자체·사찰·공공 만남 행사 모음. 만 19세 이상", info_only: true });
    expect((await listCategories()).map((c) => c.slug)).not.toContain(ROOM);
    const [r] = await query<{ is_hidden: boolean; sort_order: number }>("SELECT is_hidden, sort_order FROM categories WHERE slug = $1", [ROOM]);
    expect(r).toEqual({ is_hidden: true, sort_order: 9999 });
  });

  it("rejects posting into the room (repo and API)", async () => {
    const input = { categorySlug: ROOM, nickname: "누구", pin: "1234", title: "[행사] 같이 가실 분", body: "같이 가요 연락 주세요", summary: { lines: ["a", "b", "c"] as [string, string, string], model: "author", isAuthorEdited: true } };
    await expect(posts.createPost(input)).rejects.toMatchObject({ status: 403, code: "info_only_room" });
    const res = await postsRoute.POST(json("/api/posts", { category: ROOM, postType: "info", nickname: "누구2", pw: "1234", title: "[행사] 같이 가실 분", body: "같이 가요 연락 주세요 열 글자 넘게" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("info_only_room");
    const [{ n }] = await query<{ n: number }>("SELECT count(*)::int AS n FROM posts p JOIN categories c ON c.id = p.category_id WHERE c.slug = $1", [ROOM]);
    expect(n).toBe(0);
  });

  it("rejects comments, room chat, 갈 거예요, 같이 가요, 조 짜기, 정모 참가 and group joins on any post in the room", async () => {
    // 운영 실수 등으로 글이 생겨도 사람끼리 잇는 기능은 모두 막힌다
    const [p] = await query<{ id: string }>(
      `INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type, seed_key)
       SELECT id, '운영', 'x', '[행사] 창원 미혼남녀 만남 ' || to_char(now() + interval '10 days', 'FMMM/FMDD'), '원문 https://example.go.kr', 'info', 'roomchat:' || slug FROM categories WHERE slug = $1 RETURNING id::text`,
      [ROOM],
    );
    const id = p!.id;
    await expect(comments.createComment(id, { nickname: "댓글러", pin: "1234", body: "저도 가요" })).rejects.toMatchObject({ code: "info_only_room" });
    await expect(eg.toggleGoing(id, fp("a"))).rejects.toMatchObject({ code: "info_only_room" });
    await expect(eg.joinPool(id, fp("a"), { day: kday(10), slot: "am", age: "adult", nickname: "혼자", pin: "1234" })).rejects.toMatchObject({ code: "info_only_room" });
    await expect(eg.createOpenGroup(id, fp("a"), { day: kday(10), meetTime: "10:00", place: "창원역", capacity: 4, intro: "", nickname: "모집", pin: "1234" })).rejects.toMatchObject({ code: "info_only_room" });
    await expect(meetups.toggleRsvp(id, fp("a"), "참가")).rejects.toMatchObject({ code: "info_only_room" });
    const [g] = await query<{ id: string }>("INSERT INTO event_groups (post_id, kind, day, meet_time, place, capacity) VALUES ($1, 'open', $2, '10:00', '창원역', 4) RETURNING id::text", [id, kday(10)]);
    await expect(eg.joinGroup(g!.id, fp("b"), "참여", "1234")).rejects.toMatchObject({ code: "info_only_room" });

    const going = await goingRoute.POST(json(`/api/posts/${id}/going`, {}), { params: Promise.resolve({ id }) });
    expect(going.status).toBe(403);
    const cm = await commentsRoute.POST(json(`/api/posts/${id}/comments`, { nickname: "댓글러2", pw: "1234", body: "저도 가요" }), { params: Promise.resolve({ id }) });
    expect(cm.status).toBe(403);
    const [{ n }] = await query<{ n: number }>(
      "SELECT (SELECT count(*) FROM comments WHERE post_id = $1) + (SELECT count(*) FROM event_going WHERE post_id = $1) + (SELECT count(*) FROM event_pool WHERE post_id = $1) AS n",
      [id],
    );
    expect(Number(n)).toBe(0);
    await query("DELETE FROM posts WHERE id = $1", [id]);
  });

  const event = (over: Record<string, unknown> = {}) => ({
    title: "창원 미혼남녀 만남",
    organizer: "창원특례시",
    organizerType: "gov",
    sido: "경남",
    sigungu: "창원시",
    applyStart: kday(0),
    applyEnd: kday(5),
    eventDate: kday(19),
    birthYearMin: 1987,
    birthYearMax: 2000,
    quotaMale: 40,
    quotaFemale: 40,
    regionBasis: "live_or_work",
    areas: ["경남 창원시"],
    selection: "추첨",
    originalUrl: "https://example.go.kr/notice/1",
    collectedAt: kday(0),
    ...over,
  });

  it("admin API creates, validates, updates and hides events", async () => {
    const bad = await adminRoute.POST(json("/api/admin/singles-events", { action: "create", event: { ...event(), originalUrl: undefined } }), { params: Promise.resolve({}) });
    expect(bad.status).toBe(400);
    const dash = await adminRoute.POST(json("/api/admin/singles-events", { action: "create", event: event({ title: "창원 — 만남" }) }), { params: Promise.resolve({}) });
    expect(dash.status).toBe(400);
    const badArea = await adminRoute.POST(json("/api/admin/singles-events", { action: "create", event: event({ areas: ["경남 없는시"] }) }), { params: Promise.resolve({}) });
    expect(badArea.status).toBe(400);
    const res = await adminRoute.POST(json("/api/admin/singles-events", { action: "create", event: event() }), { params: Promise.resolve({}) });
    expect(res.status).toBe(201);
    const created = ((await res.json()) as { event: { id: string; originalUrl: string; regionBasis: string } }).event;
    expect(created).toMatchObject({ originalUrl: "https://example.go.kr/notice/1", regionBasis: "live_or_work" });
    const up = await adminRoute.POST(json("/api/admin/singles-events", { action: "update", id: created.id, event: event({ competitionNote: "지난 회차 6대1 (원문 기준)" }) }), { params: Promise.resolve({}) });
    expect(((await up.json()) as { event: { competitionNote: string } }).event.competitionNote).toBe("지난 회차 6대1 (원문 기준)");
    const other = await singles.createSinglesEvent(singles.singlesEventInput.parse(event({ title: "내린 행사" })));
    await adminRoute.POST(json("/api/admin/singles-events", { action: "hide", id: other.id, hidden: true }), { params: Promise.resolve({}) });
    expect((await singles.listSinglesEvents({ today: kday(0) })).map((e) => e.title)).toEqual(["창원 미혼남녀 만남"]);
    expect(await singles.getSinglesEvent(other.id)).toBeNull();
    const all = (await (await adminRoute.GET(new Request("http://localhost/api/admin/singles-events"), { params: Promise.resolve({}) })).json()) as { events: unknown[] };
    expect(all.events).toHaveLength(2);
  });

  it("stores alert criteria only with consent, pushes on open and the day before the deadline, once", async () => {
    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/singles-1", p256dh: "p".repeat(20), auth: "a".repeat(16) };
    const { token } = await push.subscribe(sub, { products: [], posts: [] }, fp("s"));
    const noConsent = await pushRoute.POST(json("/api/push/singles", { endpoint: sub.endpoint, token, on: true, birthYear: 1992 }), { params: Promise.resolve({}) });
    expect(noConsent.status).toBe(400);
    const { ALERT_CONSENT_VERSION } = await import("@/lib/singlesEvents");
    const on = await pushRoute.POST(json("/api/push/singles", { endpoint: sub.endpoint, token, on: true, consent: ALERT_CONSENT_VERSION, birthYear: 1992, gender: "female", areas: ["경남 창원시"] }), { params: Promise.resolve({}) });
    expect(((await on.json()) as { alert: unknown }).alert).toEqual({ birthYear: 1992, gender: "female", areas: ["경남 창원시"] });
    const [row] = await query<Record<string, unknown>>("SELECT * FROM singles_alert_subs");
    // 이름·연락처 같은 칸은 없다
    expect(Object.keys(row!).sort()).toEqual(["areas", "birth_year", "consent_at", "consent_version", "created_at", "gender", "subscription_id"]);

    // 마감이 내일인 행사 하나 더, 서울 거주자만 받는 행사 하나 (안 맞음)
    await singles.createSinglesEvent(singles.singlesEventInput.parse(event({ title: "내일 마감 행사", applyStart: kday(-5), applyEnd: kday(1) })));
    await singles.createSinglesEvent(singles.singlesEventInput.parse(event({ title: "서울만", sido: "서울", sigungu: "", regionBasis: "live", areas: ["서울"] })));

    const sent: { title: string; url: string }[] = [];
    const send = async (_s: unknown, m: { title: string; url: string }) => (sent.push(m), "sent" as const);
    const ten = new Date(`${kday(0)}T10:00:00+09:00`);
    expect(await runSinglesPush(new Date(`${kday(0)}T07:00:00+09:00`), { send })).toMatchObject({ ran: false });
    expect(await runSinglesPush(ten, { send })).toMatchObject({ ran: true, sent: 2 });
    expect(sent.map((m) => m.title).sort()).toEqual(["💌 내일 마감 · 내일 마감 행사", "💌 모집 시작 · 창원 미혼남녀 만남"]);
    expect(sent.every((m) => m.url.startsWith("/singles/") && m.url.endsWith("?from=push"))).toBe(true);
    expect(sent.some((m) => m.title.includes("서울만"))).toBe(false);
    expect(await runSinglesPush(new Date(ten.getTime() + 3600_000), { send })).toMatchObject({ sent: 0 });

    // 끄면 저장한 조건을 바로 지운다
    await pushRoute.POST(json("/api/push/singles", { endpoint: sub.endpoint, token, on: false }), { params: Promise.resolve({}) });
    const [{ n }] = await query<{ n: number }>("SELECT count(*)::int AS n FROM singles_alert_subs");
    expect(n).toBe(0);
  });

  it("MCP find_singles_events and singles_event_detail are read-only and carry the original link and notice", async () => {
    const call = async (name: string, args: Record<string, unknown>) =>
      ((await handleRpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, "fp", { readOnly: true })) as {
        result: { structuredContent: Record<string, unknown> };
      }).result.structuredContent;
    const list = await call("find_singles_events", { region: "창원", birth_year: 1992, gender: "female" });
    const events = list.events as { id: string; title: string; organizer_type: string; original_url: string; collected_at: string; eligibility: { verdict: string } }[];
    expect(events.map((e) => e.title).sort()).toEqual(["내일 마감 행사", "창원 미혼남녀 만남"]);
    expect(events[0]).toMatchObject({ organizer_type: "지자체", original_url: "https://example.go.kr/notice/1", eligibility: { verdict: "가능" } });
    expect(list.notice).toContain("최종 기준은 원문 공지");
    expect((await call("find_singles_events", { birth_year: 1980 })).events).toEqual([]);
    expect((await call("find_singles_events", { birth_year: 2010 })).note).toContain("만 19세");
    const detail = await call("singles_event_detail", { event_id: events[0]!.id });
    expect(detail).toMatchObject({ how_to_apply: "원문 공지(original_url)에서 직접 신청", requirements: { birth_years: "1987~2000년생", first_marriage_only: false } });
    expect(JSON.stringify(detail)).not.toContain("—");
    expect((await call("singles_event_detail", { event_id: "999999" })).note).toContain("찾지 못했어요");
  });
});
