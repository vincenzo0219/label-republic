import { listReports } from "@/lib/repo/reports";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  MEDICAL_MESSAGE,
  areaOverlap,
  areasOverlap,
  bandsOverlap,
  dupText,
  expiresOn,
  gigInputSchema,
  gigProblem,
  isUrgent,
  jobPayLabel,
  lessonMatches,
  medicalWordIn,
  nearlySame,
  quietNow,
  urgentWindowNow,
  type GigInput,
  type GigInputRaw,
} from "@/lib/instructorRoom";
import { ROOM_CHAT_TABS, ROOM_DEFAULT_TAB, headsFor, roomTabsAround, tabHeadsFor } from "@/lib/heads";

const vapid = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
process.env.VAPID_PRIVATE_KEY = vapid.privateKey;

const ROOM = "요가-필라테스-강사방";
// 2026-10-25(일) 12:00 KST
const NOW = new Date("2026-10-25T03:00:00Z");

const base = (over: Partial<GigInputRaw> = {}): GigInput => gigInputSchema.parse({
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

/** 💼 구인구직 글 (센터 정규) */
const job = (over: Partial<GigInputRaw> = {}): GigInput =>
  base({ kind: "job", jobType: "center", dates: [], weekdays: [1, 3], timeBands: ["저녁"], times: [], pay: 30000, noshowPay: "노쇼도 100%", ...over });

/** 🙋 강사 1대1 레슨 가능 */
const lesson = (over: Partial<GigInputRaw> = {}): GigInput =>
  base({ kind: "job", jobType: "lesson", studio: "", sido: "", sigungu: "", dates: [], times: [], weekdays: [2, 4], timeBands: ["저녁"], areas: ["서울 마포구", "서울 서대문구"], pay: 60000, payMax: 80000, places: ["rent"], career: "강사 5년", notes: "", ...over });

/** 🙋 수강생 레슨 구해요 */
const ask = (over: Partial<GigInputRaw> = {}): GigInput =>
  base({ kind: "ask", studio: "", sido: "", sigungu: "", dates: [], times: [], weekdays: [4], timeBands: ["저녁"], areas: ["서울 마포구"], classType: "기타", goal: "posture", level: "none", pay: null, notes: "", ...over });

describe("🧘 강사방 규칙", () => {
  it("shows 📋 대강 · 💼 구인구직 before 💬 채팅, then 수업 팁 · 행사·할인 ([혜택] 글은 행사·할인 탭에 함께)", () => {
    expect(ROOM_DEFAULT_TAB[ROOM]).toBe("gigs");
    expect(ROOM_CHAT_TABS[ROOM]).toEqual([
      { key: "gigs", label: "📋 대강" },
      { key: "jobs", label: "💼 구인구직" },
    ]);
    expect(roomTabsAround(ROOM)).toEqual({ before: ROOM_CHAT_TABS[ROOM], after: [] });
    // 기본 탭이 없는 방은 그대로 💬 채팅 뒤
    expect(roomTabsAround("육아-덕후방")).toEqual({ before: [], after: [{ key: "near", label: "📍동네 체험" }] });
    expect(roomTabsAround("요가-필라테스-덕후방")).toEqual({ before: [], after: [{ key: "lesson", label: "🙋 1대1 레슨 구해요" }] });
    expect(headsFor(ROOM).map((h) => h.key)).toEqual(["수업팁", "행사", "혜택"]);
    expect(tabHeadsFor(ROOM)).toEqual([
      { key: "수업팁", label: "🧘 수업 팁" },
      { key: "행사", label: "🎫 행사·할인" },
    ]);
  });

  it("rejects posts that are not a listing (no date, region or class)", () => {
    expect(gigProblem(base(), "2026-10-25")).toBeNull();
    expect(gigProblem(base({ sido: "" }), "2026-10-25")).toMatch(/지역/);
    expect(gigProblem(base({ dates: [] }), "2026-10-25")).toMatch(/날짜/);
    expect(gigProblem(base({ dates: ["2026-10-20"] }), "2026-10-25")).toMatch(/지난/);
    expect(gigProblem(base({ sigungu: "강남시" }), "2026-10-25")).toMatch(/지역/);
    expect(gigProblem(base({ contact: "문자 주세요" }), "2026-10-25")).toMatch(/연락처/);
  });

  it("validates 💼 구인구직: 구분, 요일·시간대, and 회당 금액 or 기본급 (required)", () => {
    expect(gigProblem(job(), "2026-10-25")).toBeNull();
    expect(gigProblem(job({ jobType: null }), "2026-10-25")).toMatch(/구분/);
    expect(gigProblem(job({ weekdays: [], timeBands: [] }), "2026-10-25")).toMatch(/요일이나 시간대/);
    expect(gigProblem(job({ weekdays: [], timeBands: ["오전"] }), "2026-10-25")).toBeNull();
    expect(gigProblem(job({ pay: null }), "2026-10-25")).toBe("회당 금액이나 기본급을 넣어 주세요");
    expect(gigProblem(job({ pay: null, payBase: 1_500_000 }), "2026-10-25")).toBeNull();
    expect(gigProblem(job({ jobType: "seek", studio: "", pay: null }), "2026-10-25")).toMatch(/희망 회당 금액/);
    expect(gigProblem(job({ sido: "" }), "2026-10-25")).toMatch(/지역/);
    expect(jobPayLabel({ pay: 30000, payBase: 1_500_000 })).toBe("회당 3만 · 기본급 150만");
    expect(jobPayLabel({ pay: 60000, payMax: 80000, payBase: null })).toBe("회당 6~8만");
    expect(jobPayLabel({ pay: null, payBase: null })).toBe("금액 협의");
  });

  it("expires 대강 after the last date and 구인구직·레슨 글 after 30 days (start date does not extend it)", () => {
    expect(expiresOn("sub", ["2026-10-27", "2026-10-29"], "2026-10-25")).toBe("2026-10-29");
    expect(expiresOn("job", [], "2026-10-25")).toBe("2026-11-24");
    expect(expiresOn("job", ["2027-01-10"], "2026-10-25")).toBe("2026-11-24");
    expect(expiresOn("ask", [], "2026-10-25")).toBe("2026-11-24");
  });

  it("validates 1대1 레슨 posts and blocks medical words", () => {
    expect(gigProblem(lesson(), "2026-10-25")).toBeNull();
    expect(gigProblem(ask(), "2026-10-25")).toBeNull();
    expect(gigProblem(lesson({ areas: [] }), "2026-10-25")).toMatch(/지역을 하나 이상/);
    expect(gigProblem(lesson({ areas: ["서울 강남시"] }), "2026-10-25")).toMatch(/지역/);
    expect(gigProblem(lesson({ weekdays: [], timeBands: [] }), "2026-10-25")).toMatch(/요일이나 시간대/);
    expect(gigProblem(lesson({ pay: null }), "2026-10-25")).toMatch(/회당 금액/);
    expect(gigProblem(lesson({ places: [] }), "2026-10-25")).toMatch(/장소/);
    expect(gigProblem(lesson({ pay: 80000, payMax: 60000 }), "2026-10-25")).toMatch(/범위/);
    expect(gigProblem(ask({ goal: null }), "2026-10-25")).toMatch(/목표/);
    expect(gigProblem(ask({ level: null }), "2026-10-25")).toMatch(/경험/);
    // 의료 표현: 강사 소개·경력, 수강생 글 모두
    expect(gigProblem(lesson({ career: "재활 필라테스 전문" }), "2026-10-25")).toBe(MEDICAL_MESSAGE);
    expect(gigProblem(lesson({ notes: "체형 교정 해 드려요" }), "2026-10-25")).toBe(MEDICAL_MESSAGE);
    expect(gigProblem(ask({ notes: "허리 디스크가 있어서요" }), "2026-10-25")).toBe(MEDICAL_MESSAGE);
    expect(medicalWordIn("통증 개선")).toBe(true);
    expect(medicalWordIn("치 료")).toBe(true);
    expect(medicalWordIn("자세 관리", "유연성", "산전·산후 운동")).toBe(false);
    // 대강·구인 글에는 적용하지 않는다 (센터 소개에 "재활센터"가 있을 수 있음)
    expect(gigProblem(job({ studio: "OO재활센터" }), "2026-10-25")).toBeNull();
  });

  it("matches lesson posts by overlapping region and time band", () => {
    expect(areaOverlap("서울 마포구", "서울 마포구")).toBe(true);
    expect(areaOverlap("서울", "서울 마포구")).toBe(true);
    expect(areaOverlap("서울 마포구", "서울")).toBe(true);
    expect(areaOverlap("서울 마포구", "서울 강남구")).toBe(false);
    expect(areaOverlap("경기 성남시", "서울")).toBe(false);
    expect(areasOverlap(["서울 강남구", "경기 성남시"], ["경기"])).toBe(true);
    expect(bandsOverlap(["저녁"], ["오전", "저녁"])).toBe(true);
    expect(bandsOverlap(["오전"], ["저녁"])).toBe(false);
    expect(bandsOverlap([], ["저녁"])).toBe(true);
    expect(lessonMatches({ areas: ["서울 마포구"], timeBands: ["저녁"] }, { areas: ["서울"], timeBands: ["저녁", "주말"] })).toBe(true);
    expect(lessonMatches({ areas: ["서울 마포구"], timeBands: ["오전"] }, { areas: ["서울 마포구"], timeBands: ["저녁"] })).toBe(false);
    expect(lessonMatches({ areas: ["서울 마포구"], timeBands: ["저녁"] }, { areas: ["서울 강남구"], timeBands: ["저녁"] })).toBe(false);
  });

  it("compares near-identical text", () => {
    const a = dupText("✅대강양식✅ 업체명: 가짜필라테스 10/27 19:00 3.5 010-0000-1111");
    expect(nearlySame(a, dupText("대강양식 업체명 가짜필라테스 10/27 19:00 3.5 010 0000 1111!!"))).toBe(true);
    expect(nearlySame(a, dupText("✅대강양식✅ 업체명: 다른요가 11/3 10:00 4 010-0000-2222"))).toBe(false);
  });

  it("knows 당일 급구 and quiet hours (KST)", () => {
    expect(isUrgent({ kind: "sub", dates: ["2026-10-25"], times: ["19:00"] }, NOW)).toBe(true);
    expect(isUrgent({ kind: "sub", dates: ["2026-10-25"], times: ["09:00"] }, NOW)).toBe(false);
    expect(isUrgent({ kind: "job", dates: ["2026-10-25"], times: ["19:00"] }, NOW)).toBe(false);
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
    // 라우트는 실제 시계를 쓴다: 글 날짜(NOW 기준)가 지나도 깨지지 않게 시계를 NOW 로
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    const c = await contactRoute.GET(new Request(`http://localhost/api/gigs/${id}/contact`), { params: Promise.resolve({ id }) }).finally(() => vi.useRealTimers());
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
    const reg = await gigs.createGig(job({ studio: "정규바레", classType: "바레", sido: "경기", sigungu: "성남시", weekdays: [0, 3], contact: "010-0000-4444" }), who, NOW);
    const ids = async (f: Parameters<typeof gigs.listGigs>[0], at = NOW) => (await gigs.listGigs(f, at)).items.map((g) => g.id);
    expect(await ids({ sido: "경기", sigungu: "성남시" })).toEqual([reg.id, t.id]);
    expect(await ids({ sido: "경기", when: "today" })).toEqual([reg.id, t.id]); // 정규는 오늘(일) 요일이 맞아서
    expect(await ids({ sido: "경기", classType: "요가" })).toEqual([t.id]);
    expect(await ids({ sido: "경기", kind: "job" })).toEqual([reg.id]);
    expect(await ids({ sido: "경기", kind: "sub" })).toEqual([t.id]);
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

  it("💼 구인구직: requires pay, filters by 구분·지역·초보 가능, hides after 마감 or 30 days, keeps 대강 clean", async () => {
    await expect(gigs.createGig(job({ pay: null, payBase: null, contact: "010-1000-0001" }), who, NOW)).rejects.toMatchObject({ status: 400, message: "회당 금액이나 기본급을 넣어 주세요" });
    const center = await gigs.createGig(job({ studio: "구인센터", sido: "부산", sigungu: "해운대구", beginnerOk: true, payBase: 1_800_000, contract: "employee", screening: ["시강"], contact: "010-1000-0002" }), who, NOW);
    const apt = await gigs.createGig(job({ jobType: "apt", studio: "OO아파트 커뮤니티", sido: "부산", sigungu: "수영구", contact: "010-1000-0003" }), who, NOW);
    const seek = await gigs.createGig(job({ jobType: "seek", studio: "", sido: "부산", sigungu: "", career: "매트 1년", pay: 30000, contact: "010-1000-0004" }), who, NOW);
    const ids = async (f: Parameters<typeof gigs.listGigs>[0], at = NOW) => (await gigs.listGigs({ kind: "job", sido: "부산", ...f }, at)).items.map((g) => g.id);
    expect(await ids({})).toEqual([seek.id, apt.id, center.id]);
    expect(await ids({ jobType: "apt" })).toEqual([apt.id]);
    expect(await ids({ beginner: true })).toEqual([center.id]);
    expect(await ids({ sigungu: "해운대구" })).toEqual([center.id]);
    expect(await ids({ band: "저녁" })).toEqual([seek.id, apt.id, center.id]);
    expect(await ids({ band: "오전" })).toEqual([]);
    // 대강 탭에는 안 보인다
    expect((await gigs.listGigs({ kind: "sub", sido: "부산" }, NOW)).items).toEqual([]);
    const d = await gigs.getGig(center.id, NOW);
    expect(d).toMatchObject({ kind: "job", jobType: "center", payBase: 1_800_000, beginnerOk: true, contract: "employee", screening: ["시강"], noshowPay: "노쇼도 100%", timeBands: ["저녁"] });
    expect(JSON.stringify(d)).not.toContain("010-1000-0002");
    // 30일째까지 보이고 31일째 내려간다 (DB 에는 남음)
    expect(await ids({}, new Date(NOW.getTime() + 30 * 86_400_000))).toContain(center.id);
    expect(await ids({}, new Date(NOW.getTime() + 31 * 86_400_000))).toEqual([]);
    expect(await gigs.getGig(center.id, new Date(NOW.getTime() + 31 * 86_400_000))).toMatchObject({ expired: true });
    // 마감
    await gigs.closeGig(apt.id, "a".repeat(64), "1234");
    expect(await ids({})).toEqual([seek.id, center.id]);
    // 대강 글에는 구인구직 칸이 붙지 않는다
    const sub = await gigs.createGig(base({ studio: "깨끗한대강", sido: "부산", sigungu: "해운대구", payBase: 2_000_000, beginnerOk: true, jobType: "center", timeBands: ["오전"], contact: "010-1000-0005" }), who, NOW);
    expect(await gigs.getGig(sub.id, NOW)).toMatchObject({ kind: "sub", jobType: null, payBase: null, beginnerOk: false, timeBands: [] });
    // API: 구인구직 거르기
    const res = await list.GET(new Request(`http://localhost/api/gigs?kind=job&sido=${encodeURIComponent("부산")}&beginner=1`), { params: Promise.resolve({}) });
    expect(((await res.json()) as { items: { id: string }[] }).items.map((g) => g.id)).toEqual([center.id]);
  });

  it("🙋 1대1 레슨: multi-region posts, region/time filters, two-way matches, medical words, report", async () => {
    const t1 = await gigs.createGig(lesson({ nickname: "강사하나", contact: "010-2000-0001" }), who, NOW);
    const t2 = await gigs.createGig(lesson({ nickname: "강사둘", areas: ["서울 강남구"], contact: "010-2000-0002" }), who, NOW);
    const t3 = await gigs.createGig(lesson({ nickname: "강사셋", areas: ["서울 마포구"], timeBands: ["오전"], weekdays: [1], contact: "010-2000-0003" }), who, NOW);
    const s1 = await gigs.createGig(ask({ nickname: "수강생", contact: "010-2000-0004" }), { fingerprint: "b".repeat(64), net: null }, NOW);
    const s2 = await gigs.createGig(ask({ nickname: "수강생둘", areas: ["서울"], timeBands: [], goal: "flex", level: "some", pay: 50000, payMax: 70000, contact: "010-2000-0005" }), { fingerprint: "c".repeat(64), net: null }, NOW);
    // 대표 지역은 첫 지역
    expect(await gigs.getGig(t1.id, NOW)).toMatchObject({ sido: "서울", sigungu: "마포구", areas: ["서울 마포구", "서울 서대문구"], places: ["rent"], payMax: 80000, career: "강사 5년" });
    // 두 번째 지역(서대문구)으로도 찾아진다
    const lessonIds = async (f: Parameters<typeof gigs.listGigs>[0]) => (await gigs.listGigs({ kind: "job", jobType: "lesson", sido: "서울", ...f }, NOW)).items.map((g) => g.id);
    expect(await lessonIds({ sigungu: "서대문구" })).toEqual([t1.id]);
    expect(await lessonIds({ sigungu: "마포구", band: "저녁" })).toEqual([t1.id]);
    // 수강생 탭: "서울" 전체로 올린 글은 마포구에서도 보인다
    const askIds = async (f: Parameters<typeof gigs.listGigs>[0]) => (await gigs.listGigs({ kind: "ask", ...f }, NOW)).items.map((g) => g.id);
    expect(await askIds({ sido: "서울", sigungu: "마포구" })).toEqual([s2.id, s1.id]);
    expect(await askIds({ sido: "서울", sigungu: "강남구" })).toEqual([s2.id]);
    // 레슨 구해요 글은 강사방 목록(종류 없이)에 섞이지 않는다
    expect((await gigs.listGigs({ sido: "서울" }, NOW)).items.map((g) => g.id)).not.toContain(s1.id);
    // 매칭: 수강생(마포·저녁) → 마포 저녁 강사만 / 강사(마포·서대문 저녁) → 두 수강생 / 강남 강사 → "서울" 수강생만
    const of = async (id: string) => (await gigs.lessonMatchesFor((await gigs.getGig(id, NOW))!, NOW)).map((g) => g.id);
    expect(await of(s1.id)).toEqual([t1.id]);
    expect(await of(s2.id)).toEqual([t3.id, t2.id, t1.id]);
    expect(await of(t1.id)).toEqual([s2.id, s1.id]);
    expect(await of(t2.id)).toEqual([s2.id]);
    expect(await of(t3.id)).toEqual([s2.id]);
    // 의료 표현은 올리지 않는다
    await expect(gigs.createGig(ask({ notes: "거북목 교정이 목표예요", contact: "010-2000-0006" }), who, NOW)).rejects.toMatchObject({ status: 400, message: MEDICAL_MESSAGE });
    await expect(gigs.createGig(lesson({ career: "통증 관리 전문", contact: "010-2000-0007" }), who, NOW)).rejects.toMatchObject({ status: 400, message: MEDICAL_MESSAGE });
    // 🚩 신고: 한 브라우저 한 번. 가리지 않고 운영자에게 보고 (10/29)
    expect(await gigs.reportGig(t2.id, "1".repeat(64), "선입금 요구")).toEqual({ is_blinded: false, alreadyReported: false });
    expect(await gigs.reportGig(t2.id, "1".repeat(64), "또")).toEqual({ is_blinded: false, alreadyReported: true });
    await gigs.reportGig(t2.id, "2".repeat(64), "");
    expect(await gigs.reportGig(t2.id, "3".repeat(64), "")).toEqual({ is_blinded: false, alreadyReported: false });
    expect(await lessonIds({})).toContain(t2.id);
    expect(await listReports({ type: "gig", id: t2.id })).toMatchObject([{ reports: 3, reasons: "선입금 요구", url: `/gigs/${t2.id}` }]);
    await expect(gigs.reportGig("999999", "4".repeat(64), "")).rejects.toMatchObject({ status: 404 });
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
