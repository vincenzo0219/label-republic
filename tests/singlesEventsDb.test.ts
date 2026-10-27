import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// 라우트의 after() (AI 운영·알림) 는 요청 밖이라 건너뛴다
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));

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

d("💌 미혼남녀 만남 행사 (DB): 커뮤니티는 열고 만남 연결·연락처 교환은 막는 방", async () => {
  process.env.DATABASE_URL = url;
  process.env.SITE_URL = "https://nobangjang.com";
  const { pool, query } = await import("@/lib/db");
  const posts = await import("@/lib/repo/posts");
  const comments = await import("@/lib/repo/comments");
  const eg = await import("@/lib/repo/eventGoing");
  const meetups = await import("@/lib/repo/meetups");
  const cards = await import("@/lib/repo/cards");
  const { ensureRoomChat } = await import("@/lib/repo/roomChat");
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
  const reportRoute = await import("@/app/api/comments/[id]/report/route");

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

  it("092 adds the room on the operating DB; 097 lists it; 098 opens community features but keeps matching off", async () => {
    expect(await getCategoryBySlug(ROOM)).toBeNull();
    await query("INSERT INTO categories (slug, name, description) VALUES ('반려견-덕후방', '반려견', '') ON CONFLICT DO NOTHING");
    await query(readFileSync(path.join(dir, "092_singles_events.sql"), "utf8"));
    expect(await getCategoryBySlug(ROOM)).toMatchObject({ name: "💌 미혼남녀 만남 행사", description: "지자체·사찰·공공 만남 행사 모음. 만 19세 이상", info_only: true });
    expect((await listCategories()).map((c) => c.slug)).not.toContain(ROOM);
    for (const f of readdirSync(dir).filter((f) => f >= "097" && f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
    expect(await getCategoryBySlug(ROOM)).toMatchObject({ info_only: false, no_matching: true, is_hidden: false });
    expect((await listCategories()).map((c) => c.slug)).toContain(ROOM);
    const [r] = await query<{ is_hidden: boolean; sort_order: number }>("SELECT is_hidden, sort_order FROM categories WHERE slug = $1", [ROOM]);
    expect(r).toEqual({ is_hidden: false, sort_order: 100 });
  });

  const summary = { lines: ["a", "b", "c"] as [string, string, string], model: "author", isAuthorEdited: true };
  let roomPostId = "";

  it("allows posting into the room (repo and API) but rejects 정모 proposals and contact info", async () => {
    const created = await posts.createPost({ categorySlug: ROOM, nickname: "누구", pin: "1234", title: "[자랑] 창원 행사 당첨됐어요", body: "추첨 결과 나왔어요. 다들 화이팅", summary });
    expect(created.category.slug).toBe(ROOM);
    roomPostId = created.id;
    const res = await postsRoute.POST(json("/api/posts", { category: ROOM, postType: "chat", nickname: "누구2", pw: "1234", title: "다들 어디 신청했어요?", body: "이번 달 마감인 행사 정리해 봐요 열 글자 넘게" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(201);
    // 연락처·SNS 아이디: 글·수정 모두 거절
    for (const body of ["010-1234-5678 로 연락 주세요", "카톡 아이디 abc123", "https://open.kakao.com/o/abcd", "인스타 @minji.kim", "minji@naver.com", "관심 있으면 DM 주세요"])
      await expect(posts.createPost({ categorySlug: ROOM, nickname: "누구", pin: "1234", title: "같이 가실 분", body, summary })).rejects.toMatchObject({ status: 400, code: "contact_rule", message: "이 방에서는 연락처·SNS 아이디를 주고받을 수 없어요" });
    const bad = await postsRoute.POST(json("/api/posts", { category: ROOM, postType: "chat", nickname: "누구3", pw: "1234", title: "번호 좀 주세요", body: "같이 가요 연락처 교환해요 열 글자 넘게" }), { params: Promise.resolve({}) });
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain("contact_rule");
    await expect(posts.updatePost(created.id, "", "1234", { body: "제 카톡: abc123" })).rejects.toMatchObject({ code: "contact_rule" });
    // 정모 제안 (사람끼리 만나기) 은 거절
    await expect(
      posts.createPost({ categorySlug: ROOM, nickname: "정모", pin: "1234", title: "정모 해요", body: "모여요", summary, postType: "meetup", meetup: { meetAt: new Date(Date.now() + 5 * DAY).toISOString(), location: "창원역", minParticipants: 2, capacity: 4 } }),
    ).rejects.toMatchObject({ status: 403, code: "no_matching_room" });
    // 다른 방은 연락처 규칙이 없다 (휴대전화는 기존처럼 가려서 저장)
    await query("INSERT INTO categories (slug, name, description) VALUES ('러닝-덕후방', '러닝', '') ON CONFLICT DO NOTHING");
    await expect(posts.createPost({ categorySlug: "러닝-덕후방", nickname: "러너", pin: "1234", title: "카톡 아이디 abc123", body: "같이 뛰어요", summary })).resolves.toBeTruthy();
  });

  it("allows comments and room chat, rejects contact info there, and blocks 갈 거예요, 같이 가요, 조 짜기, 정모 참가 and group joins", async () => {
    const [p] = await query<{ id: string }>(
      `INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type)
       SELECT id, '운영', 'x', '[행사] 창원 미혼남녀 만남 ' || to_char(now() + interval '10 days', 'FMMM/FMDD'), '원문 https://example.go.kr', 'info' FROM categories WHERE slug = $1 RETURNING id::text`,
      [ROOM],
    );
    const id = p!.id;
    const c = await comments.createComment(id, { nickname: "댓글러", pin: "1234", body: "저도 신청했어요" });
    expect(c.body).toBe("저도 신청했어요");
    const chat = await ensureRoomChat(ROOM);
    await expect(comments.createComment(chat!.postId, { nickname: "수다", pin: "1234", body: "다들 반가워요" })).resolves.toMatchObject({ body: "다들 반가워요" });
    for (const body of ["010 1234 5678", "카톡 주세요", "인스타 아이디 알려 주세요", "번호 좀 주세요", "디엠 보낼게요"]) {
      await expect(comments.createComment(id, { nickname: "댓글러", pin: "1234", body })).rejects.toMatchObject({ status: 400, code: "contact_rule" });
      await expect(comments.createComment(chat!.postId, { nickname: "수다", pin: "1234", body })).rejects.toMatchObject({ code: "contact_rule" });
    }
    await expect(comments.updateComment(String(c.id), "", "1234", "제 카톡: abc123")).rejects.toMatchObject({ code: "contact_rule" });

    await expect(eg.toggleGoing(id, fp("a"))).rejects.toMatchObject({ code: "no_matching_room" });
    await expect(eg.joinPool(id, fp("a"), { day: kday(10), slot: "am", age: "adult", nickname: "혼자", pin: "1234" })).rejects.toMatchObject({ code: "no_matching_room" });
    await expect(eg.createOpenGroup(id, fp("a"), { day: kday(10), meetTime: "10:00", place: "창원역", capacity: 4, intro: "", nickname: "모집", pin: "1234" })).rejects.toMatchObject({ code: "no_matching_room" });
    await expect(meetups.toggleRsvp(id, fp("a"), "참가")).rejects.toMatchObject({ code: "no_matching_room" });
    const [g] = await query<{ id: string }>("INSERT INTO event_groups (post_id, kind, day, meet_time, place, capacity) VALUES ($1, 'open', $2, '10:00', '창원역', 4) RETURNING id::text", [id, kday(10)]);
    await expect(eg.joinGroup(g!.id, fp("b"), "참여", "1234")).rejects.toMatchObject({ code: "no_matching_room" });
    // 🎉 덕질 기념일·💪 응원 카드도 이 방에는 없다
    await expect(cards.cardRoom(ROOM)).rejects.toMatchObject({ code: "invalid_category" });

    const going = await goingRoute.POST(json(`/api/posts/${id}/going`, {}), { params: Promise.resolve({ id }) });
    expect(going.status).toBe(403);
    const cm = await commentsRoute.POST(json(`/api/posts/${id}/comments`, { nickname: "댓글러2", pw: "1234", body: "저도 가요" }), { params: Promise.resolve({ id }) });
    expect(cm.status).toBe(201);
    const cmBad = await commentsRoute.POST(json(`/api/posts/${id}/comments`, { nickname: "댓글러3", pw: "1234", body: "오픈채팅 들어오세요" }), { params: Promise.resolve({ id }) });
    expect(cmBad.status).toBe(400);
    const [{ n }] = await query<{ n: number }>(
      "SELECT (SELECT count(*) FROM event_going WHERE post_id = $1) + (SELECT count(*) FROM event_pool WHERE post_id = $1) + (SELECT count(*) FROM event_group_members m JOIN event_groups g ON g.id = m.group_id WHERE g.post_id = $1) AS n",
      [id],
    );
    expect(Number(n)).toBe(0);
    expect((await comments.listComments(id)).map((x) => x.body)).toEqual(["저도 신청했어요", "저도 가요"]);
    await query("DELETE FROM posts WHERE id = $1", [id]);
  });

  it("🚩 comment and chat-line reports: one per person, hidden after 3 distinct reports", async () => {
    const chat = await ensureRoomChat(ROOM);
    const c = await comments.createComment(chat!.postId, { nickname: "이상한", pin: "1234", body: "선입금하면 소개해 줄게요" });
    const id = String(c.id);
    expect(await comments.reportComment(id, fp("1"), "사기·금전 요구 (선입금, 계좌 등)")).toEqual({ hidden: false, already: false });
    expect(await comments.reportComment(id, fp("1"), "사기·금전 요구 (선입금, 계좌 등)")).toEqual({ hidden: false, already: true });
    expect(await comments.reportComment(id, fp("2"), "성희롱·불쾌한 연락")).toEqual({ hidden: false, already: false });
    const res = await reportRoute.POST(
      new Request(`http://localhost/api/comments/${id}/report`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.77", "user-agent": "other" }, body: JSON.stringify({ reason: "미성년자에게 부적절" }) }),
      { params: Promise.resolve({ id }) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ hidden: true });
    const [row] = (await comments.listComments(chat!.postId)).filter((x) => String(x.id) === id);
    expect(row).toMatchObject({ body: "", hidden_reason: "reported" });
    await expect(comments.reportComment("999999999", fp("3"), "")).rejects.toMatchObject({ status: 404 });
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

  it("행사 카드마다 댓글 글 하나 (목록에 안 나옴, 연락처 막힘, 본 사람 수)", async () => {
    const { ensureSinglesTalks } = await import("@/lib/repo/singlesTalk");
    const ev = await singles.createSinglesEvent(singles.singlesEventInput.parse(event({ title: "댓글 테스트 행사" })));
    const t1 = await ensureSinglesTalks([{ id: ev.id, title: ev.title }]);
    const t2 = await ensureSinglesTalks([{ id: ev.id, title: ev.title }]);
    expect(t1[ev.id]!.postId).toBe(t2[ev.id]!.postId);
    expect(t1[ev.id]).toMatchObject({ comments: 0, views: 0 });
    const postId = t1[ev.id]!.postId;
    await expect(comments.createComment(postId, { nickname: "질문러", pin: "1234", body: "서류는 언제까지 내요?" })).resolves.toMatchObject({ body: "서류는 언제까지 내요?" });
    await expect(comments.createComment(postId, { nickname: "질문러", pin: "1234", body: "카톡 주세요" })).rejects.toMatchObject({ code: "contact_rule" });
    expect((await ensureSinglesTalks([{ id: ev.id, title: ev.title }]))[ev.id]!.comments).toBe(1);
    const { addSeen, flushViewCounts } = await import("@/lib/metrics");
    addSeen([postId]);
    await flushViewCounts();
    expect((await ensureSinglesTalks([{ id: ev.id, title: ev.title }]))[ev.id]!.views).toBe(1);
    const cat = await getCategoryBySlug(ROOM);
    const list = await posts.listPosts({ categoryId: cat!.id, sort: "latest" });
    expect(list.items.some((p) => p.id === postId)).toBe(false);
    await singles.setSinglesEventHidden(ev.id, true);
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
