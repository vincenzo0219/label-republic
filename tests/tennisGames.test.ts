import { listReports } from "@/lib/repo/reports";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ROOM_CHAT_TABS } from "@/lib/heads";
import { contactProblem, gameProblem, needLabel, parseKakaoGame, whenRange, type GameInputRaw } from "@/lib/tennisGames";

// 2026-10-28(수) 15:00 KST
const NOW = new Date("2026-10-28T06:00:00Z");
const TODAY = "2026-10-28";

describe("🎾 카톡 한 줄 → 게임 칸", () => {
  it("단톡방에서 보던 모집 글을 읽는다", () => {
    expect(parseKakaoGame("10/31(토) 10-12시 용인베스트 실내 남복2 모집", NOW)).toMatchObject({
      date: "2026-10-31", start: "10:00", end: "12:00", type: "남복", needM: 2, sido: "경기", sigungu: "용인시", court: "용인베스트 실내",
    });
    expect(parseKakaoGame("11/1(일), 을숙도 4번, 08시~10시, 남복 3명 모집", NOW)).toMatchObject({ date: "2026-11-01", start: "08:00", end: "10:00", needM: 3, court: "을숙도 4번" });
    expect(parseKakaoGame("29(목) 성남양지 오후8~10시 남복 남1 모집", NOW)).toMatchObject({ date: "2026-10-29", start: "20:00", end: "22:00", needM: 1, sigungu: "성남시" });
    expect(parseKakaoGame("10/28(수) 성복5코트 20시~21시반(3년 이상 여 1명)", NOW)).toMatchObject({ start: "20:00", end: "21:30", needF: 1, level: "구력 3년 이상" });
    expect(parseKakaoGame("(마감) 11/3(화) 사직 오전6-8시 남복 3년 이상 (한분모집)", NOW)).toMatchObject({ date: "2026-11-03", start: "06:00", end: "08:00", needM: 1, court: "사직" });
    expect(parseKakaoGame("급)10/29목 오전 7-9 관악구민 남복1분 모집", NOW)).toMatchObject({ date: "2026-10-29", sido: "서울", sigungu: "관악구", needM: 1 });
    expect(parseKakaoGame("금일 20-22시 용인양지 단식 모집", NOW)).toMatchObject({ date: TODAY, type: "단식" });
    expect(parseKakaoGame("구리왕숙 10/29 오후1-3시 혼복 여1모집", NOW)).toMatchObject({ start: "13:00", end: "15:00", type: "혼복", needF: 1 });
  });
  it("모르는 건 비워 둔다", () => {
    expect(parseKakaoGame("테니스 치실 분", NOW)).not.toHaveProperty("date");
  });
});

describe("🎾 게임 규칙", () => {
  const ok = { sido: "부산", sigungu: "", court: "을숙도 4번", date: "2026-10-31", start: "08:00", end: "10:00", type: "남복" as const, needM: 2, needF: 0, needAny: 0, level: "", cost: "", notes: "", contact: "https://open.kakao.com/o/abc123" };
  it("연락처는 오픈채팅·카톡 아이디만, 전화번호는 안 받는다", () => {
    expect(contactProblem("https://open.kakao.com/o/sAbC12")).toBeNull();
    expect(contactProblem("tennis_kim")).toBeNull();
    expect(contactProblem("010-1234-5678")).toMatch(/전화번호/);
    expect(gameProblem({ ...ok, notes: "문의 010 1234 5678" }, TODAY)).toMatch(/전화번호/);
  });
  it("지난 날짜·인원 없음·시간 거꾸로", () => {
    expect(gameProblem(ok, TODAY)).toBeNull();
    expect(gameProblem({ ...ok, date: "2026-10-27" }, TODAY)).toMatch(/지난/);
    expect(gameProblem({ ...ok, needM: 0 }, TODAY)).toMatch(/몇 명/);
    expect(gameProblem({ ...ok, end: "07:00" }, TODAY)).toMatch(/끝나는/);
  });
  it("주말·인원 글자", () => {
    expect(whenRange("weekend", TODAY)).toEqual(["2026-10-31", "2026-11-01"]);
    expect(whenRange("weekend", "2026-11-01")).toEqual(["2026-11-01", "2026-11-01"]);
    expect(needLabel({ needM: 1, needF: 2, needAny: 0 })).toBe("남1 · 여2");
  });
  it("테니스방에 🎾 게임 모집 탭", () => {
    expect(ROOM_CHAT_TABS["테니스-덕후방"]?.map((t) => t.key)).toEqual(["games"]);
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("🎾 게임 모집 (DB)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const games = await import("@/lib/repo/tennisGames");
  const list = await import("@/app/api/tennis-games/route");
  const contactRoute = await import("@/app/api/tennis-games/[id]/contact/route");
  const who = { fingerprint: "f".repeat(64), net: null };
  const base = (over: Partial<GameInputRaw> = {}): GameInputRaw => ({
    nickname: "테스트러", pw: "1234", sido: "부산", sigungu: "", court: "을숙도 4번", date: "2026-10-31", start: "08:00", end: "10:00", type: "남복", needM: 2,
    contact: "https://open.kakao.com/o/test123", ...over,
  });

  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("올리고, 목록엔 연락처 없이, 누르면 연락처", async () => {
    const { id } = await games.createGame(base(), who, NOW);
    const r = await games.listGames({ sido: "부산" }, NOW);
    expect(r.items.map((g) => g.id)).toEqual([id]);
    expect(JSON.stringify(r)).not.toContain("open.kakao.com");
    expect(await games.gameContact(id, NOW)).toBe("https://open.kakao.com/o/test123");
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    try {
      const res = await list.GET(new Request(`http://localhost/api/tennis-games?sido=${encodeURIComponent("부산")}`), { params: Promise.resolve({}) });
      expect(res.headers.get("x-robots-tag")).toBe("noindex");
      expect(await res.text()).not.toContain("open.kakao.com");
      const c = await contactRoute.GET(new Request(`http://localhost/api/tennis-games/${id}/contact`), { params: Promise.resolve({ id }) });
      expect(c.headers.get("x-robots-tag")).toMatch(/noindex/);
    } finally {
      vi.useRealTimers();
    }
    // 같은 게임 다시 올리기 → 409
    await expect(games.createGame(base(), who, NOW)).rejects.toMatchObject({ status: 409, gameId: id });
  });

  it("거르기: 지역·종목·날짜, 지난 게임은 빠진다", async () => {
    await games.createGame(base({ sido: "서울", sigungu: "관악구", court: "관악구민", date: "2026-10-29", start: "07:00", end: "09:00", type: "여복", needM: 0, needF: 1 }), who, NOW);
    expect((await games.listGames({ type: "여복" }, NOW)).items.map((g) => g.court)).toEqual(["관악구민"]);
    expect((await games.listGames({ when: "tomorrow" }, NOW)).items.map((g) => g.court)).toEqual(["관악구민"]);
    expect((await games.listGames({ when: "weekend" }, NOW)).items.map((g) => g.court)).toEqual(["을숙도 4번"]);
    expect((await games.listGames({ sido: "서울", sigungu: "관악구" }, NOW)).total).toBe(1);
    // 가까운 날짜 먼저
    expect((await games.listGames({}, NOW)).items.map((g) => g.date)).toEqual(["2026-10-29", "2026-10-31"]);
    // 11/1 이 되면 10/29·10/31 게임은 목록에서 빠진다
    expect((await games.listGames({}, new Date("2026-11-01T01:00:00Z"))).total).toBe(0);
  });

  it("글쓴이만 수정·마감·삭제, 전화번호·욕설은 막는다", async () => {
    const { id } = await games.createGame(base({ court: "사직실내", date: "2026-11-03" }), who, NOW);
    await expect(games.updateGame(id, who.fingerprint, { ...base({ court: "사직실내 2번", date: "2026-11-03" }), pw: "9999" }, NOW)).rejects.toMatchObject({ status: 403 });
    await games.updateGame(id, who.fingerprint, base({ court: "사직실내 2번", date: "2026-11-03", needM: 1 }), NOW);
    expect((await games.gameForOwner(id, who.fingerprint, "1234")).court).toBe("사직실내 2번");
    await games.closeGame(id, who.fingerprint, "1234");
    await expect(games.gameContact(id, NOW)).rejects.toMatchObject({ status: 410 });
    await games.deleteGame(id, who.fingerprint, "1234");
    expect((await query("SELECT 1 FROM tennis_games WHERE id = $1", [id])).length).toBe(0);
    await expect(games.createGame(base({ contact: "010-1234-5678", date: "2026-11-04" }), who, NOW)).rejects.toMatchObject({ status: 400 });
    await expect(games.createGame(base({ notes: "씨발 빨리", date: "2026-11-04" }), who, NOW)).rejects.toMatchObject({ status: 400 });
  });

  it("연락처 없이도 올리고, 💬 댓글로 참여 (10/29 대표님 \"오픈채팅이 없는데\")", async () => {
    const talk = await import("@/lib/repo/tennisTalk");
    const { id } = await games.createGame(base({ contact: "", court: "수지체육공원 B", date: "2026-11-06" }), { fingerprint: "e".repeat(64), net: null }, NOW);
    const g = (await games.listGames({}, NOW)).items.find((x) => x.id === id)!;
    expect(g.hasContact).toBe(false);
    expect(g.comments).toBe(0);
    const a = await talk.ensureTennisTalk(id);
    expect((await talk.ensureTennisTalk(id)).postId).toBe(a.postId);
    await query("UPDATE posts SET comment_count = 2 WHERE id = $1", [a.postId]);
    expect((await games.listGames({}, NOW)).items.find((x) => x.id === id)!.comments).toBe(2);
    // 숨은 방 글은 방 피드에 안 나온다
    const [c] = await query<{ is_hidden: boolean }>("SELECT is_hidden FROM categories WHERE slug = 'tennis-talk'");
    expect(c!.is_hidden).toBe(true);
  });

  it("신고는 가리지 않고 운영자에게 보고 (10/29)", async () => {
    const { id } = await games.createGame(base({ court: "스포원 실내", date: "2026-11-05" }), who, NOW);
    for (let i = 0; i < 5; i++) await games.reportGame(id, String(i).repeat(64), "광고");
    expect((await games.listGames({}, NOW)).items.map((g) => g.id)).toContain(id);
    const [r] = await listReports({ type: "game", id });
    expect(r).toMatchObject({ reports: 5, reasons: "광고", hidden: false });
  });
});
