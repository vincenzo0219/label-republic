import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  areaOptions,
  ibolLink,
  isThisWeekFree,
  isValidArea,
  kstShort,
  normalizeProgram,
  normalizeResponse,
  parseKstDate,
  programStatus,
  REGIONS,

} from "@/lib/kidsPrograms";

const vapid = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
process.env.VAPID_PRIVATE_KEY = vapid.privateKey;

describe("📍 kids programs adapter", () => {
  it("normalizes the documented field names", () => {
    const p = normalizeProgram({
      id: "p-1",
      name: "숲 체험",
      institution: "화성시 육아종합지원센터",
      place: "동탄 센트럴파크",
      area: "화성시",
      age: "5세",
      free: true,
      cost: 0,
      kind: "체험",
      dates: "11/1(토) 10:00",
      applyStart: "2026-10-28T10:00:00+09:00",
      applyEnd: "2026-10-30 18:00",
      applyUrl: "https://center.example.go.kr/apply?no=7",
      ibolUrl: "https://ibol.kr/p/p-1?from=nobangjang",
      source: "화성시 육아종합지원센터",
    })!;
    expect(p).toMatchObject({
      id: "p-1",
      name: "숲 체험",
      institution: "화성시 육아종합지원센터",
      city: "화성시",
      age: "5세",
      free: true,
      cost: "무료",
      kind: "체험",
      dateText: "11/1(토) 10:00",
      applyStartAt: "2026-10-28T01:00:00.000Z",
      applyEndAt: "2026-10-30T09:00:00.000Z",
      applyUrl: "https://center.example.go.kr/apply?no=7",
      ibolUrl: "https://ibol.kr/p/p-1?from=nobangjang",
    });
  });

  it("accepts variant field names and wrappers", () => {
    const body = {
      data: {
        programs: [
          {
            programId: 42,
            title: "가족 음악회",
            org: { name: "수원문화재단" },
            location: "수원SK아트리움",
            target_age: ["4세", "5세"],
            is_free: "N",
            price: 5000,
            type: "공연",
            program_start: "2026.11.08",
            program_end: "20261109",
            registration_start: "2026-11-01 09:30",
            registration_end: 1793000000,
            apply_link: "https://ticket.example.com/42",
            ibol_link: "https://ibol.kr/programs/42",
            provider: "수원문화재단 누리집",
            unexpectedField: 1,
          },
          { title: "id 없음" },
        ],
      },
    };
    const r = normalizeResponse(body);
    expect(r.shapeOk).toBe(true);
    expect(r.dropped).toBe(1);
    expect(r.unknownKeys).toContain("unexpectedField");
    expect(r.items).toHaveLength(1);
    const p = r.items[0]!;
    expect(p).toMatchObject({
      id: "42",
      name: "가족 음악회",
      institution: "수원문화재단",
      place: "수원SK아트리움",
      age: "4세, 5세",
      free: false,
      cost: "5,000원",
      kind: "공연",
      dateText: "11/8 ~ 11/9",
      applyStartAt: "2026-11-01T00:30:00.000Z",
      applyEndAt: new Date(1793000000 * 1000).toISOString(),
      applyUrl: "https://ticket.example.com/42",
      source: "수원문화재단 누리집",
    });
    // 아이볼 링크에만 from=nobangjang
    expect(p.ibolUrl).toBe("https://ibol.kr/programs/42?from=nobangjang");
    expect(p.applyUrl).not.toContain("from=");
  });

  it("reads the production field names (10/24 확인)", () => {
    const r = normalizeResponse({
      items: [{
        id: "nat-nlcy-1133426", title: "개미와 베짱이", organization: "국립어린이청소년도서관", kind: "체험", region: "서울 강남구",
        venue: "체험형 동화구연실", age: "4~7세", free: false, fee: "기관 공고 확인", eventStart: "2026-11-01", eventEnd: "2026-11-01",
        applicationStart: "2026-10-25T09:00:00+09:00", applicationEnd: "2026-11-01T11:00:00+09:00", status: "곧 신청 시작", walkIn: false,
        applyUrl: "https://www.nlcy.go.kr/x", ibolUrl: "https://ibol.kr/?program=nat-nlcy-1133426&src=nobangjang&from=nobangjang", source: "국립어린이청소년도서관 · 프로그램",
      }],
    });
    expect(r.unknownKeys).toEqual([]);
    expect(r.items[0]).toMatchObject({
      name: "개미와 베짱이", institution: "국립어린이청소년도서관", city: "서울 강남구", place: "체험형 동화구연실", cost: "기관 공고 확인",
      startDate: "2026-10-31T15:00:00.000Z", dateText: "11/1", applyStartAt: "2026-10-25T00:00:00.000Z", applyEndAt: "2026-11-01T02:00:00.000Z",
      ibolUrl: "https://ibol.kr/?program=nat-nlcy-1133426&src=nobangjang&from=nobangjang",
    });
  });

  it("moves an ibol-only apply link to the ibol link and leaves institution links unchanged", () => {
    const p = normalizeProgram({ id: "x", name: "n", url: "https://ibol.kr/p/x" })!;
    expect(p.applyUrl).toBeNull();
    expect(p.ibolUrl).toBe("https://ibol.kr/p/x?from=nobangjang");
    expect(ibolLink("https://gov.example.kr/a?b=1")).toBe("https://gov.example.kr/a?b=1");
    expect(ibolLink("https://ibol.kr/a?from=nobangjang")).toBe("https://ibol.kr/a?from=nobangjang");
  });

  it("degrades on unknown shapes", () => {
    expect(normalizeResponse({ message: "hi" })).toMatchObject({ items: [], shapeOk: false, unknownKeys: ["message"] });
    expect(normalizeResponse("oops").shapeOk).toBe(false);
    expect(normalizeResponse([null, 1, { id: "a b", name: "bad id" }]).items).toHaveLength(0);
    expect(parseKstDate("언젠가")).toBeNull();
  });

  it("validates areas from the region list", () => {
    expect(isValidArea("화성시")).toBe(true);
    expect(isValidArea("성남시")).toBe(true);
    expect(isValidArea("서울 강남구")).toBe(true);
    expect(isValidArea("광주")).toBe(true);
    expect(isValidArea("세종")).toBe(true);
    expect(isValidArea("강남구")).toBe(false);
    expect(isValidArea("서울")).toBe(true);
    expect(isValidArea("화성시; drop")).toBe(false);
    const seoul = REGIONS.find((r) => r.short === "서울")!;
    expect(areaOptions(seoul)[0]).toEqual({ label: "서울 전체", value: "서울" });
  });
});

describe("📍 status chip in KST", () => {
  const p = { applyStartAt: "2026-10-28T01:00:00.000Z", applyEndAt: "2026-10-30T09:00:00.000Z" };
  it("is 접수 예정 with the KST time before start", () => {
    expect(programStatus(p, new Date("2026-10-28T00:59:59Z"))).toEqual({ key: "soon", label: "접수 예정 10/28 10:00" });
  });
  it("is 접수 중 between start and end, 마감 after", () => {
    expect(programStatus(p, new Date("2026-10-28T01:00:00Z"))?.label).toBe("접수 중");
    expect(programStatus(p, new Date("2026-10-30T09:00:01Z"))?.label).toBe("마감");
  });
  it("uses the KST date across midnight UTC", () => {
    expect(kstShort("2026-12-31T15:30:00Z")).toBe("01/01 00:30");
    expect(programStatus({ applyStartAt: null, applyEndAt: null })).toBeNull();
  });
  it("counts this week's free programs", () => {
    const now = new Date("2026-10-24T03:00:00Z");
    const base = normalizeProgram({ id: "w", name: "n", free: true, startDate: "2026-10-26" })!;
    expect(isThisWeekFree(base, now)).toBe(true);
    expect(isThisWeekFree({ ...base, startDate: "2026-11-20T00:00:00Z" }, now)).toBe(false);
    expect(isThisWeekFree({ ...base, free: false }, now)).toBe(false);
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

const sample = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `프로그램 ${id}`,
  institution: "성남시 육아종합지원센터",
  place: "분당",
  area: "성남시",
  age: "5세",
  free: true,
  kind: "체험",
  applyStart: new Date(Date.now() + 3 * 86400_000).toISOString(),
  applyUrl: "https://center.example.go.kr/a",
  ibolUrl: `https://ibol.kr/p/${id}`,
  ...over,
});

d("📍 kids programs (DB)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const kids = await import("@/lib/repo/kidsPrograms");
  const push = await import("@/lib/repo/push");
  const posts = await import("@/lib/repo/posts");
  const { createComment } = await import("@/lib/repo/comments");
  const { runKidsPush } = await import("@/lib/jobs/push");
  const { GET } = await import("@/app/api/kids-programs/route");

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
    await query("INSERT INTO categories (name, slug, description) VALUES ('육아방', '육아-덕후방', '육아') ON CONFLICT (slug) DO NOTHING");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    kids.resetKidsCache();
  });
  afterAll(async () => {
    await pool().end();
  });

  const mockFetch = (body: unknown, status = 200) => {
    const fn = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fn);
    return fn;
  };

  it("validates the query before calling ibol", async () => {
    const fn = mockFetch([]);
    const call = (qs: string) => GET(new Request(`http://localhost/api/kids-programs?${qs}`), { params: Promise.resolve({}) });
    expect((await call("area=강남구")).status).toBe(400);
    expect((await call("area=")).status).toBe(400);
    expect((await call("area=성남시&age=DROP")).status).toBe(400);
    expect((await call("area=성남시&kind=콘서트")).status).toBe(400);
    expect((await call("area=성남시&soon=99")).status).toBe(400);
    expect(fn).not.toHaveBeenCalled();
    const ok = await call(`area=${encodeURIComponent("서울 강남구")}&free=1&soon=7&limit=5`);
    expect(ok.status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(1);
    const calledUrl = String((fn.mock.calls[0] as unknown[])[0]);
    expect(calledUrl).toBe("https://ibol.kr/api/partner/programs?area=%EC%84%9C%EC%9A%B8%20%EA%B0%95%EB%82%A8%EA%B5%AC&free=1&soon=7&limit=5");
  });

  it("caches per 10-minute bucket, saves items, and falls back on failure", async () => {
    const fn = mockFetch({ items: [sample("c1"), sample("c2")] });
    const t0 = Math.floor(Date.now() / kids.KIDS_BUCKET_MS) * kids.KIDS_BUCKET_MS;
    const q = { area: "성남시", free: true, limit: 5 };
    const a = await kids.fetchPrograms(q, t0 + 1000);
    const b = await kids.fetchPrograms(q, t0 + 5 * 60_000);
    expect(a.map((p) => p.id)).toEqual(["c1", "c2"]);
    expect(b).toBe(a);
    expect(fn).toHaveBeenCalledTimes(1);
    // 다음 10분 칸에서는 다시 묻는다. 실패하면 직전 결과
    vi.stubGlobal("fetch", vi.fn(async () => new Response("err", { status: 500 })));
    expect((await kids.fetchPrograms(q, t0 + 11 * 60_000)).map((p) => p.id)).toEqual(["c1", "c2"]);
    // 처음부터 실패면 502
    await expect(kids.fetchPrograms({ area: "수원시" }, t0)).rejects.toMatchObject({ status: 502 });
    // DB 에 남아서 /kids/<id> 가 열린다
    expect((await kids.getProgram("c1"))?.name).toBe("프로그램 c1");
  });

  it("looks a program up by id when it is not cached, and remembers misses", async () => {
    const fn = mockFetch({ items: [sample("look-1")] });
    expect((await kids.getProgram("look-1"))?.id).toBe("look-1");
    expect(String((fn.mock.calls[0] as unknown[])[0])).toContain("?id=look-1");
    mockFetch({ items: [] });
    expect(await kids.getProgram("nope-1")).toBeNull();
    const again = mockFetch({ items: [sample("nope-1")] });
    expect(await kids.getProgram("nope-1")).toBeNull();
    expect(again).not.toHaveBeenCalled();
    expect(await kids.getProgram("../etc")).toBeNull();
  });

  it("creates the program post lazily, once, and keeps it out of the room feeds", async () => {
    mockFetch({ items: [sample("lazy-1")] });
    await kids.fetchPrograms({ area: "성남시" });
    const p = (await kids.getProgram("lazy-1"))!;
    expect(await kids.programPostId("lazy-1")).toBeNull();
    const [id1, id2] = await Promise.all([kids.ensureProgramPost(p), kids.ensureProgramPost(p)]);
    expect(id1).toBe(id2);
    expect(await kids.ensureProgramPost(p)).toBe(id1);
    const [row] = await query<{ title: string; nickname: string; post_type: string; seed_key: string; n: number }>(
      "SELECT title, nickname, post_type, seed_key, (SELECT count(*)::int FROM posts WHERE seed_key = 'ibol:lazy-1') AS n FROM posts WHERE id = $1",
      [id1],
    );
    expect(row).toMatchObject({ title: "[동네 체험] 프로그램 lazy-1 · 성남시 육아종합지원센터", nickname: "노방장", post_type: "info", seed_key: "ibol:lazy-1", n: 1 });
    await createComment(id1, { nickname: "엄마", pin: "1234", body: "작년에 다녀왔는데 좋았어요", fingerprint: "a".repeat(64) });
    expect(await kids.programCommentCounts(["lazy-1", "none"])).toEqual({ "lazy-1": 1 });

    const [cat] = await query<{ id: number }>("SELECT id FROM categories WHERE slug = '육아-덕후방'");
    const all = await posts.listPosts({ categoryId: cat!.id, sort: "latest" });
    const info = await posts.listPosts({ categoryId: cat!.id, sort: "latest", type: "info" });
    const home = await posts.listPosts({ sort: "latest" });
    for (const f of [all, info, home]) expect(f.items.some((x) => String(x.id) === id1)).toBe(false);
    const search = await posts.listPosts({ sort: "latest", q: "lazy-1" });
    expect(search.items.some((x) => String(x.id) === id1)).toBe(true);
  });

  it("sends the T-30m and T0 pushes exactly once each", async () => {
    const start = new Date(Date.now() + 2 * 3600_000);
    start.setUTCSeconds(0, 0);
    mockFetch({ items: [sample("push-1", { applyStart: start.toISOString() }), sample("push-2", { applyStart: new Date(start.getTime() + 86400_000).toISOString() })] });
    await kids.fetchPrograms({ area: "성남시", limit: 9 });
    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/kids-1", p256dh: "p".repeat(20), auth: "a".repeat(16) };
    const { token } = await push.subscribe(sub, { products: [], posts: [] }, "f".repeat(64));
    const other = { endpoint: "https://fcm.googleapis.com/fcm/send/kids-2", p256dh: "q".repeat(20), auth: "b".repeat(16) };
    const t2 = await push.subscribe(other, { products: [], posts: [] }, "e".repeat(64));
    expect(await kids.setProgramAlert(sub.endpoint, token, "push-1", "성남시", true)).toMatchObject({ on: true });
    await kids.setProgramAlert(other.endpoint, t2.token, "push-2", "성남시", true);
    await expect(kids.setProgramAlert(sub.endpoint, "x".repeat(20), "push-1", "성남시", true)).rejects.toBeTruthy();
    // 글이 하나 생겼다 (첫 🔔)
    expect(await kids.programPostId("push-1")).not.toBeNull();

    const sent: { endpoint: string; title: string; url: string }[] = [];
    const send = async (s: { endpoint: string }, m: { title: string; url: string }) => (sent.push({ endpoint: s.endpoint, ...m }), "sent" as const);
    const at = (ms: number) => new Date(start.getTime() + ms);

    expect(await runKidsPush(at(-31 * 60_000), { send })).toMatchObject({ ran: true, sent: 0 });
    expect(await runKidsPush(at(-30 * 60_000), { send })).toMatchObject({ sent: 1 });
    expect(await runKidsPush(at(-29 * 60_000), { send })).toMatchObject({ sent: 0 });
    expect(await runKidsPush(at(-1000), { send })).toMatchObject({ sent: 0 });
    expect(await runKidsPush(at(0), { send })).toMatchObject({ sent: 1 });
    expect(await runKidsPush(at(60_000), { send })).toMatchObject({ sent: 0 });
    expect(sent).toEqual([
      { endpoint: sub.endpoint, title: "🔔 30분 뒤 신청 시작", url: "/kids/push-1?from=push", body: "프로그램 push-1", tag: "lr-kids-push-1-pre" },
      { endpoint: sub.endpoint, title: "🔔 지금 신청 시작", url: "/kids/push-1?from=push", body: "프로그램 push-1", tag: "lr-kids-push-1-start" },
    ]);
    // 이미 접수 중이면 🔔 대신 신청하기
    await expect(kids.setProgramAlert(sub.endpoint, token, "push-1", "성남시", true, at(60_000))).rejects.toMatchObject({ status: 409 });
  });

  it("skips a missed T-30m push and does not send stale ones", async () => {
    const start = new Date(Date.now() + 5 * 3600_000);
    mockFetch({ items: [sample("late-1", { applyStart: start.toISOString() })] });
    await kids.fetchPrograms({ area: "성남시", limit: 3 });
    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/kids-3", p256dh: "r".repeat(20), auth: "c".repeat(16) };
    const { token } = await push.subscribe(sub, { products: [], posts: [] }, "d".repeat(64));
    await kids.setProgramAlert(sub.endpoint, token, "late-1", "성남시", true);
    const sent: string[] = [];
    const send = async (_s: unknown, m: { title: string }) => (sent.push(m.title), "sent" as const);
    // 서버가 멈췄다가 시작 5분 뒤에 돌면 시작 알림만
    await runKidsPush(new Date(start.getTime() + 5 * 60_000), { send });
    expect(sent).toEqual(["🔔 지금 신청 시작"]);
    // 끄면 지운다
    expect(await kids.setProgramAlert(sub.endpoint, token, "late-1", "성남시", false)).toMatchObject({ on: false });
  });
});

