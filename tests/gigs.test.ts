import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dupText, expiresOn, gigProblem, isUrgent, nearlySame, quietNow, urgentWindowNow, type GigInput } from "@/lib/instructorRoom";
import { ROOM_CHAT_TABS, ROOM_DEFAULT_TAB, headsFor, tabHeadsFor } from "@/lib/heads";

const vapid = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
process.env.VAPID_PRIVATE_KEY = vapid.privateKey;

const ROOM = "요가-필라테스-강사방";
// 2026-10-25(일) 12:00 KST
const NOW = new Date("2026-10-25T03:00:00Z");

const base = (over: Partial<GigInput> = {}): GigInput => ({
  nickname: "테스트센터",
  pw: "1234",
  kind: "sub",
  studio: "가짜필라테스",
  sido: "서울",
  sigungu: "마포구",
  station: "",
  address: "",
  dates: ["2026-10-27"],
  weekdays: [],
  times: ["19:00", "20:00"],
  classType: "기구필라테스",
  equipment: [],
  pay: 35000,
  tax: false,
  payday: "",
  contact: "010-0000-1111",
  notes: "지각 노쇼 없이",
  raw: "",
  ...over,
});

describe("🧘 강사방 규칙", () => {
  it("has the board as the default tab and a 수업 팁 tab", () => {
    expect(ROOM_DEFAULT_TAB[ROOM]).toBe("gigs");
    expect(ROOM_CHAT_TABS[ROOM]).toEqual([{ key: "gigs", label: "📋 대강·구인" }]);
    expect(headsFor(ROOM).map((h) => h.key)).toEqual(["수업팁"]);
    expect(tabHeadsFor(ROOM)).toEqual([{ key: "수업팁", label: "🧘 수업 팁" }]);
  });

  it("rejects posts that are not a listing (no date, region or class)", () => {
    expect(gigProblem(base(), "2026-10-25")).toBeNull();
    expect(gigProblem(base({ sido: "" }), "2026-10-25")).toMatch(/지역/);
    expect(gigProblem(base({ dates: [] }), "2026-10-25")).toMatch(/날짜/);
    expect(gigProblem(base({ kind: "regular", dates: [], weekdays: [] }), "2026-10-25")).toMatch(/요일/);
    expect(gigProblem(base({ kind: "regular", dates: [], weekdays: [1, 3] }), "2026-10-25")).toBeNull();
    expect(gigProblem(base({ dates: ["2026-10-20"] }), "2026-10-25")).toMatch(/지난/);
    expect(gigProblem(base({ sigungu: "강남시" }), "2026-10-25")).toMatch(/지역/);
    expect(gigProblem(base({ contact: "문자 주세요" }), "2026-10-25")).toMatch(/연락처/);
  });

  it("expires 대강 after the last date and 정규 after 30 days", () => {
    expect(expiresOn("sub", ["2026-10-27", "2026-10-29"], "2026-10-25")).toBe("2026-10-29");
    expect(expiresOn("regular", [], "2026-10-25")).toBe("2026-11-24");
  });

  it("compares near-identical text", () => {
    const a = dupText("✅대강양식✅ 업체명: 가짜필라테스 10/27 19:00 3.5 010-0000-1111");
    expect(nearlySame(a, dupText("대강양식 업체명 가짜필라테스 10/27 19:00 3.5 010 0000 1111!!"))).toBe(true);
    expect(nearlySame(a, dupText("✅대강양식✅ 업체명: 다른요가 11/3 10:00 4 010-0000-2222"))).toBe(false);
  });

  it("knows 당일 급구 and quiet hours (KST)", () => {
    expect(isUrgent({ kind: "sub", dates: ["2026-10-25"], times: ["19:00"] }, NOW)).toBe(true);
    expect(isUrgent({ kind: "sub", dates: ["2026-10-25"], times: ["09:00"] }, NOW)).toBe(false);
    expect(isUrgent({ kind: "regular", dates: ["2026-10-25"], times: ["19:00"] }, NOW)).toBe(false);
    expect(quietNow(new Date("2026-10-25T13:30:00Z"))).toBe(true); // 22:30
    expect(quietNow(new Date("2026-10-25T23:30:00Z"))).toBe(false); // 08:30
    expect(urgentWindowNow(new Date("2026-10-25T21:30:00Z"))).toBe(true); // 06:30
    expect(urgentWindowNow(new Date("2026-10-25T18:00:00Z"))).toBe(false); // 03:00
  });
});

describe("/k/10", () => {
  it("302s people to the board and gives scrapers an empty page", async () => {
    const { GET } = await import("@/app/k/[code]/route");
    const r = await GET(new Request("http://localhost/k/10", { headers: { "user-agent": "Mozilla/5.0 (iPhone)" } }), { params: Promise.resolve({ code: "10" }) });
    expect(r.status).toBe(302);
    expect(decodeURIComponent(r.headers.get("location")!)).toBe(`/c/${ROOM}?from=kakao_instructor`);
    const s = await GET(new Request("http://localhost/k/10", { headers: { "user-agent": "kakaotalk-scrap/1.0" } }), { params: Promise.resolve({ code: "10" }) });
    expect(s.status).toBe(200);
    expect(await s.text()).not.toMatch(/강사|요가|title/);
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("📋 대강·구인 (DB)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const gigs = await import("@/lib/repo/gigs");
  const push = await import("@/lib/repo/push");
  const { runGigPush, gigPushMessage } = await import("@/lib/jobs/gigPush");
  const list = await import("@/app/api/gigs/route");
  const contactRoute = await import("@/app/api/gigs/[id]/contact/route");
  const who = { fingerprint: "f".repeat(64), net: null };

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("creates, lists without contact, and shows contact only on request", async () => {
    const { id } = await gigs.createGig(base(), who, NOW);
    const r = await gigs.listGigs({}, NOW);
    expect(r.items.map((g) => g.id)).toContain(id);
    expect(JSON.stringify(r)).not.toContain("010-0000-1111");
    const detail = await gigs.getGig(id, NOW);
    expect(JSON.stringify(detail)).not.toContain("010-0000-1111");
    expect(await gigs.gigContact(id, NOW)).toBe("010-0000-1111");
    // API 목록에도 연락처 없음, noindex
    const res = await list.GET(new Request("http://localhost/api/gigs?sido=서울"), { params: Promise.resolve({}) });
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(await res.text()).not.toContain("010-0000");
    const c = await contactRoute.GET(new Request(`http://localhost/api/gigs/${id}/contact`), { params: Promise.resolve({ id }) });
    expect(c.headers.get("x-robots-tag")).toMatch(/noindex/);
  });

  it("rejects a near-duplicate from the same poster within 24h", async () => {
    const first = await gigs.createGig(base({ studio: "중복필라테스", contact: "010-0000-2222", dates: ["2026-10-28"] }), who, NOW);
    await expect(gigs.createGig(base({ studio: "중복필라테스", contact: "010 0000 2222", dates: ["2026-10-28"], nickname: "다른닉" }), { fingerprint: "e".repeat(64), net: null }, new Date(NOW.getTime() + 3600_000)))
      .rejects.toMatchObject({ status: 409, message: "이미 올라가 있어요, 끌어올리기 대신 그대로 노출돼요", gigId: first.id });
    // 다른 날짜면 새 글
    await expect(gigs.createGig(base({ studio: "중복필라테스", contact: "010-0000-2222", dates: ["2026-10-30"] }), who, NOW)).resolves.toBeTruthy();
    // 24시간 뒤면 다시 올릴 수 있다
    await expect(gigs.createGig(base({ studio: "중복필라테스", contact: "010-0000-2222", dates: ["2026-10-28"] }), who, new Date(NOW.getTime() + 25 * 3600_000))).resolves.toBeTruthy();
  });

  it("blocks abusive text", async () => {
    await expect(gigs.createGig(base({ notes: "씨발 빨리 연락해", dates: ["2026-11-02"] }), who, NOW)).rejects.toMatchObject({ status: 400 });
  });

  it("filters by region, today, class and kind; hides past and closed", async () => {
    const t = await gigs.createGig(base({ studio: "오늘요가", classType: "요가", sido: "경기", sigungu: "성남시", dates: ["2026-10-25"], times: ["20:00"], contact: "010-0000-3333" }), who, NOW);
    const reg = await gigs.createGig(base({ kind: "regular", studio: "정규바레", classType: "바레", sido: "경기", sigungu: "성남시", dates: [], weekdays: [0, 3], contact: "010-0000-4444" }), who, NOW);
    const ids = async (f: Parameters<typeof gigs.listGigs>[0], at = NOW) => (await gigs.listGigs(f, at)).items.map((g) => g.id);
    expect(await ids({ sido: "경기", sigungu: "성남시" })).toEqual([reg.id, t.id]);
    expect(await ids({ sido: "경기", when: "today" })).toEqual([reg.id, t.id]); // 정규는 오늘(일) 요일이 맞아서
    expect(await ids({ sido: "경기", classType: "요가" })).toEqual([t.id]);
    expect(await ids({ sido: "경기", kind: "regular" })).toEqual([reg.id]);
    expect((await gigs.listGigs({ sido: "경기" }, NOW)).items.find((g) => g.id === t.id)?.urgent).toBe(true);
    // 다음 날이면 오늘 대강은 빠진다 (DB 에는 남음)
    expect(await ids({ sido: "경기" }, new Date(NOW.getTime() + 86_400_000))).toEqual([reg.id]);
    expect(await gigs.getGig(t.id, new Date(NOW.getTime() + 86_400_000))).toMatchObject({ expired: true });
    // 마감: 비밀번호가 맞아야
    await expect(gigs.closeGig(reg.id, "a".repeat(64), "9999")).rejects.toMatchObject({ status: 403 });
    await gigs.closeGig(reg.id, "a".repeat(64), "1234");
    expect(await ids({ sido: "경기" })).toEqual([t.id]);
    await expect(gigs.gigContact(reg.id, NOW)).rejects.toMatchObject({ status: 410 });
  });

  it("sends regional alerts, respects quiet hours, and one-tap unsubscribes", async () => {
    await query("DELETE FROM gig_listings");
    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/gig-1", p256dh: "r".repeat(20), auth: "c".repeat(16) };
    const { token } = await push.subscribe(sub, { products: [], posts: [] }, "d".repeat(64));
    const t0 = new Date("2026-10-25T02:00:00Z"); // 11:00 KST
    expect(await gigs.setGigAlert(sub.endpoint, token, ["서울 마포구", "경기", "없는곳"], ["기구필라테스"], t0)).toEqual({ areas: ["서울 마포구", "경기"], classes: ["기구필라테스"] });
    expect(await gigs.getGigAlert(sub.endpoint, token)).toEqual({ areas: ["서울 마포구", "경기"], classes: ["기구필라테스"] });

    const sent: { title: string; body: string; url: string }[] = [];
    const send = async (_s: unknown, m: { title: string; body: string; url: string }) => (sent.push(m), "sent" as const);
    const at = (min: number) => new Date(t0.getTime() + min * 60_000);

    const a = await gigs.createGig(base({ studio: "알림필라", contact: "010-0000-5555" }), who, at(1)); // 마포 기구 → 보냄
    await gigs.createGig(base({ studio: "강남필라", sigungu: "강남구", contact: "010-0000-6666" }), who, at(1)); // 지역 다름
    await gigs.createGig(base({ studio: "요가집", sido: "경기", sigungu: "수원시", classType: "요가", contact: "010-0000-7777" }), who, at(1)); // 수업 다름
    // 올린 지 2분 전에는 보내지 않는다
    expect(await runGigPush(at(2), { send })).toMatchObject({ sent: 0 });
    expect(await runGigPush(at(4), { send })).toMatchObject({ sent: 1 });
    expect(sent[0]!.title).toBe("📋 새 대강 · 마포구");
    expect(sent[0]!.body).toBe("10/27(화) · 19:00 · 기구필라테스 · 3.5만");
    expect(sent[0]!.url).toMatch(new RegExp(`^/gigs/${a.id}\\?from=push&u=`));
    // 다시 돌아도 같은 글은 안 보낸다, 15분 간격 동안 모인다
    await gigs.createGig(base({ studio: "두번째", sido: "경기", sigungu: "성남시", contact: "010-0000-8888" }), who, at(5));
    await gigs.createGig(base({ studio: "세번째", sido: "경기", sigungu: "구리시", contact: "010-0000-9999" }), who, at(6));
    expect(await runGigPush(at(10), { send })).toMatchObject({ sent: 0 });
    expect(await runGigPush(at(20), { send })).toMatchObject({ sent: 1 });
    expect(sent[1]!.title).toBe("📋 내 지역 새 대강·구인 2건");
    expect(sent[1]!.url).toMatch(/^\/c\/%EC%9A%94.*\?from=push&u=/);

    // 밤 11시 글: 조용한 시간이라 안 보내고, 아침 8시에 모아서
    const night = new Date("2026-10-25T14:00:00Z"); // 23:00
    await gigs.createGig(base({ studio: "밤글", contact: "010-0000-1212", dates: ["2026-10-28"] }), who, night);
    expect(await runGigPush(new Date(night.getTime() + 10 * 60_000), { send })).toMatchObject({ ran: false });
    // 06:30: 오늘(10/26) 급구만 먼저
    await gigs.createGig(base({ studio: "새벽급구", contact: "010-0000-1313", dates: ["2026-10-26"], times: ["10:00"] }), who, new Date("2026-10-25T21:00:00Z")); // 06:00
    expect(await runGigPush(new Date("2026-10-25T21:30:00Z"), { send })).toMatchObject({ sent: 1 });
    expect(sent[2]!.title).toBe("🔥 오늘 급구 · 마포구");
    expect(await runGigPush(new Date("2026-10-25T22:00:00Z"), { send })).toMatchObject({ sent: 0 }); // 07:00
    // 08:00: 밤 글만 (급구는 이미 보냄)
    expect(await runGigPush(new Date("2026-10-25T23:00:00Z"), { send })).toMatchObject({ sent: 1 });
    expect(sent[3]!.body).toMatch(/^10\/28/);

    // 알림 속 증표로 한 번에 끄기
    const u = decodeURIComponent(/u=([^&]+)/.exec(sent[0]!.url)![1]!);
    expect(await gigs.offGigAlertByToken(`${u}x`)).toBe(false);
    expect(await gigs.offGigAlertByToken(u)).toBe(true);
    expect(await gigs.getGigAlert(sub.endpoint, token)).toBeNull();
    // 빈 목록이면 끈다
    await gigs.setGigAlert(sub.endpoint, token, ["서울"], []);
    expect(await gigs.setGigAlert(sub.endpoint, token, [], [])).toBeNull();
    expect(gigPushMessage).toBeTypeOf("function");
  });
});
