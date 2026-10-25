import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("🏪 오늘도 장사중 대기열 (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const q = await import("@/lib/repo/shopQueue");
  const { listPosts } = await import("@/lib/repo/posts");
  const { kstDate } = await import("@/lib/shopRoom");
  let catId = 0;

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  beforeEach(async () => {
    await query("TRUNCATE shop_queue, shop_title_overrides, nickname_claims, comments, posts, categories RESTART IDENTITY CASCADE");
    const [c] = await query<{ id: number }>("INSERT INTO categories (slug, name, description) VALUES ('오늘도-장사중', '🏪 오늘도 장사중', '') RETURNING id");
    catId = c!.id;
  });
  afterAll(async () => {
    await pool().end();
  });

  const item = (over: Partial<Parameters<typeof q.upsertQueueItem>[0]> = {}) => ({
    key: "2026-10-26-0830",
    publishAt: kstDate("2026-10-26", "08:30"),
    head: "직원",
    title: "[직원] [☀️ 아침 계산 #1] 손님이 생각의 70%만 와도 약 10개월",
    body: "본문\n\n내 가게 숫자로 계산해 보기: https://bizpilot.kr/?utm_source=nobangjang",
    imageUrls: [],
    pinned: false,
    pin: "1234",
    ...over,
  });

  it("시각이 되면 한 번만 올리고, 그 전에는 올리지 않는다", async () => {
    await q.upsertQueueItem(item());
    expect(await q.publishDue(kstDate("2026-10-26", "08:29"))).toEqual([]);
    const ids = await q.publishDue(kstDate("2026-10-26", "08:30"));
    expect(ids).toHaveLength(1);
    expect(await q.publishDue(kstDate("2026-10-26", "08:31"))).toEqual([]);
    const [p] = await query<{ nickname: string; title: string; post_type: string }>("SELECT nickname, title, post_type FROM posts WHERE id = $1", [ids[0]]);
    expect(p).toMatchObject({ nickname: "비즈파일럿", post_type: "info" });
    expect((await q.upsertQueueItem(item())).status).toBe("already_published");
  });

  it("하루 넘게 지난 칸은 올리지 않는다", async () => {
    await q.upsertQueueItem(item());
    expect(await q.publishDue(kstDate("2026-10-27", "09:00"))).toEqual([]);
  });

  it("바꾼 제목이 있으면 그 제목으로 올린다", async () => {
    await q.setTitleOverrides({ "2026-10-26-0830": "[직원] [☀️ 아침 계산 #1] 단정문 제목" });
    await q.upsertQueueItem(item());
    const [id] = await q.publishDue(kstDate("2026-10-26", "08:30"));
    const [p] = await query<{ title: string }>("SELECT title FROM posts WHERE id = $1", [id]);
    expect(p!.title).toBe("[직원] [☀️ 아침 계산 #1] 단정문 제목");
  });

  it("비밀번호를 비우면 서버 값으로 닉네임을 등록한다", async () => {
    const { pin: _p, ...noPin } = item();
    await q.upsertQueueItem(noPin);
    await q.upsertQueueItem({ ...noPin, key: "2026-10-26-1030" });
    expect(q.serverPin()).toMatch(/^\d{4}$/);
  });

  it("고정 글은 그 탭 맨 위, 다시 넣으면 글 내용만 고친다", async () => {
    await q.upsertQueueItem(item({ key: "pin:직원", title: "[직원] 📌 자주 묻는 질문 정답", body: "Q. A.", pinned: true, publishAt: kstDate("2026-10-25", "12:00") }));
    await q.upsertQueueItem(item());
    await q.publishDue(kstDate("2026-10-25", "12:01"));
    await q.publishDue(kstDate("2026-10-26", "08:30"));
    const tab = await listPosts({ categoryId: catId, sort: "latest", head: "직원", pinnedTab: "직원" });
    expect(tab.items.map((p) => p.title)).toEqual(["[직원] 📌 자주 묻는 질문 정답", item().title]);
    expect(tab.items[0]!.pinned_tab).toBe("직원");
    const plain = await listPosts({ categoryId: catId, sort: "latest", head: "직원" });
    expect(plain.items[0]!.title).toBe(item().title);
    const r = await q.upsertQueueItem(item({ key: "pin:직원", title: "[직원] 📌 자주 묻는 질문 정답", body: "Q. A. 더", pinned: true }));
    expect(r.status).toBe("updated_post");
    const [p] = await query<{ body: string }>("SELECT body FROM posts WHERE id = $1", [r.postId]);
    expect(p!.body).toBe("Q. A. 더");
  });

  it("닉네임 비즈파일럿은 처음 비밀번호로 등록, 다른 비밀번호는 막는다", async () => {
    await q.upsertQueueItem(item());
    await expect(q.upsertQueueItem(item({ key: "2026-10-26-1030", pin: "9999" }))).rejects.toMatchObject({ status: 409 });
  });

  it("그림은 bizpilot.kr https 주소만", async () => {
    await expect(q.upsertQueueItem(item({ imageUrls: ["https://evil.example/1.png"] }))).rejects.toMatchObject({ status: 400 });
    await expect(q.upsertQueueItem(item({ imageUrls: ["http://bizpilot.kr/1.png"] }))).rejects.toMatchObject({ status: 400 });
  });

  it("07:30 공지: 전체 탭 맨 위, 바뀐 게 없으면 그대로", async () => {
    await q.upsertQueueItem(item());
    await q.upsertQueueItem(item({ key: "2026-10-26-2230", publishAt: kstDate("2026-10-26", "22:30"), head: "가게", title: "[가게] [🌙 잘된 가게 #1] 쉐이크쉑" }));
    expect(await q.refreshNotice(kstDate("2026-10-26", "07:00"))).toBe("updated");
    let [n] = await query<{ title: string; pinned_tab: string }>("SELECT title, pinned_tab FROM posts WHERE seed_key = 'shoproom:notice'");
    expect(n!.title).toContain("방 규칙");
    expect(await q.refreshNotice(kstDate("2026-10-26", "07:31"))).toBe("updated");
    expect(await q.refreshNotice(kstDate("2026-10-26", "07:32"))).toBe("same");
    [n] = await query<{ title: string; pinned_tab: string }>("SELECT title, pinned_tab FROM posts WHERE seed_key = 'shoproom:notice'");
    expect(n).toEqual({ title: "📅 오늘 올라올 글 2개 · 10/26(월)", pinned_tab: "*" });
    await q.publishDue(kstDate("2026-10-26", "08:30"));
    const all = await listPosts({ categoryId: catId, sort: "latest", hotFirst: true, pinnedTab: "*" });
    expect(all.items[0]!.title).toBe(n!.title);
  });

  it("일요일 22:30 글이 올라간 뒤 이번 주 모아 보기 한 번", async () => {
    await q.upsertQueueItem(item());
    await q.upsertQueueItem(item({ key: "2026-11-01-2230", publishAt: kstDate("2026-11-01", "22:30"), head: "가게", title: "[가게] [🌙 잘된 가게 #7] 일요일 글" }));
    await q.publishDue(kstDate("2026-10-26", "08:30"));
    // 22:30 칸이 아직 안 올라갔으면 기다린다
    expect(await q.postWeekRoundup(kstDate("2026-11-01", "22:31"))).toBeNull();
    await q.publishDue(kstDate("2026-11-01", "22:31"));
    const id = await q.postWeekRoundup(kstDate("2026-11-01", "22:32"));
    expect(id).toBeTruthy();
    expect(await q.postWeekRoundup(kstDate("2026-11-01", "22:40"))).toBeNull();
    const [p] = await query<{ title: string; body: string }>("SELECT title, body FROM posts WHERE id = $1", [id]);
    expect(p!.title).toBe("🗓 이번 주 모아 보기 · 10/26(월)~11/1(일)");
    expect(p!.body).toContain("👥 직원·알바\n· [☀️ 아침 계산 #1]");
    expect(p!.body.indexOf("👥")).toBeLessThan(p!.body.indexOf("🏆"));
  });

  it("피드: 새 칸을 넣고, 바뀐 것만 고치고, 올린 id 는 다시 안 올린다 · 10분에 한 번", async () => {
    const feed = JSON.parse(readFileSync(path.join(__dirname, "fixtures/bizpilot-feed.json"), "utf8"));
    const { syncFeed, feedState } = await import("@/lib/repo/shopFeed");
    const now = kstDate("2026-10-26", "08:00");
    const fetcher = async () => ({ ...feed, posts: feed.posts.slice(0, 3).map((p: { images: string[] }) => ({ ...p, images: [] })) });
    const r1 = await syncFeed(now, { fetcher });
    expect(r1.errors).toEqual([]);
    expect(r1.queued).toHaveLength(8);
    expect((await syncFeed(new Date(now.getTime() + 60_000), { fetcher })).ran).toBe(false);
    const r2 = await syncFeed(new Date(now.getTime() + 60_000), { fetcher, force: true });
    expect(r2.queued).toEqual([]);
    const pins = await q.publishDue(new Date(now.getTime() + 60_000));
    expect(pins).toHaveLength(5);
    const posted = await q.publishDue(kstDate("2026-10-26", "08:30"));
    expect(posted).toHaveLength(1);
    const changed = async () => ({ ...(await fetcher()), pinned: feed.pinned.map((p: { body: string }, i: number) => (i === 0 ? { ...p, body: "새 본문" } : p)) });
    const r3 = await syncFeed(kstDate("2026-10-26", "08:40"), { fetcher: changed, force: true });
    expect(r3.queued).toEqual(["pin:계산"]);
    const [pin] = await query<{ body: string; pinned_tab: string }>("SELECT body, pinned_tab FROM posts WHERE pinned_tab = '계산'");
    expect(pin!.body).toBe("새 본문");
    expect(await query("SELECT 1 FROM posts WHERE title LIKE '[직원] [☀️ 아침 계산 #1]%'")).toHaveLength(1);
    const st = await feedState();
    expect(st).toMatchObject({ posts: 3, pinned: 5, last_error: "" });
    const bad = await syncFeed(kstDate("2026-10-26", "09:00"), { fetcher: async () => ({ posts: "x" }), force: true });
    expect(bad.errors[0]).toMatch(/모양/);
    const down = await syncFeed(kstDate("2026-10-26", "09:10"), { fetcher: async () => { throw new Error("timeout"); }, force: true });
    expect(down.errors[0]).toMatch(/timeout/);
  });

  it("주간 숫자: 탭별 글·댓글, 두 번 넘게 나온 질문", async () => {
    const { shopStats, repeatedQuestions } = await import("@/lib/repo/shopStats");
    await q.upsertQueueItem(item());
    const [id] = await q.publishDue(kstDate("2026-10-26", "08:30"));
    for (const [n, b] of [["a", "주휴수당은 언제 줘요?"], ["b", "주휴 수당은 언제 줘요 ?"], ["c", "좋아요"]]) {
      await query("INSERT INTO comments (post_id, nickname, pw_hash, body) VALUES ($1, $2, 'x', $3)", [id, n, b]);
    }
    const s = (await shopStats(7))!;
    expect(s.tabs.find((t) => t.key === "직원")).toMatchObject({ posts: 1, comments: 3 });
    expect(s.repeated_questions).toEqual([{ text: "주휴수당은 언제 줘요?", count: 2, post_ids: [id] }]);
    expect(s.new_members).toBe(3);
    expect(repeatedQuestions([{ body: "한 번?", post_id: "1" }])).toEqual([]);
  });

  it("안 올라간 칸은 지울 수 있다", async () => {
    await q.upsertQueueItem(item());
    expect(await q.deleteQueueItem("2026-10-26-0830")).toBe(true);
    expect(await q.listQueue()).toEqual([]);
  });
});
