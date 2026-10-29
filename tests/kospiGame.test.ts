import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dayLabel, kospiBadge, moveOf, nextWeekday, questionDay, statsOf } from "@/lib/kospiGame";

describe("📈 코스피 맞히기 (규칙)", () => {
  it("마감: 평일 9시 전이면 오늘, 9시부터는 다음 거래일, 주말은 월요일", () => {
    expect(questionDay(new Date("2026-11-01T23:59:00Z"))).toBe("2026-11-02"); // 월 08:59 KST
    expect(questionDay(new Date("2026-11-02T00:00:00Z"))).toBe("2026-11-03"); // 월 09:00 KST
    expect(questionDay(new Date("2026-11-06T01:00:00Z"))).toBe("2026-11-09"); // 금 10:00 KST
    expect(questionDay(new Date("2026-11-07T03:00:00Z"))).toBe("2026-11-09"); // 토
    expect(nextWeekday("2026-11-06")).toBe("2026-11-09");
    expect(dayLabel("2026-11-09")).toBe("11/9(월)");
  });
  it("결과: 오르면 1, 내리면 -1, 보합 0", () => {
    expect([moveOf(100, 101), moveOf(100, 99), moveOf(100, 100)]).toEqual([1, -1, 0]);
  });
  it("성적: 틀리면 연속은 0부터, 기록은 남는다", () => {
    expect(statsOf([true, true, true, false, true])).toEqual({ wins: 4, losses: 1, streak: 3 });
    expect(statsOf([false, true, true, true]).streak).toBe(0);
  });
  it("🎯 맞힌 수 - 틀린 수 (화면 X), 1 이상일 때만", () => {
    expect(kospiBadge(7, 3)).toEqual({ label: "🎯+4", title: "코스피 맞히기 7승 3패" });
    expect(kospiBadge(1, 0)?.label).toBe("🎯+1");
    expect(kospiBadge(5, 5)).toBeNull();
    expect(kospiBadge(2, 4)).toBeNull();
    expect(kospiBadge(0, 0)).toBeNull();
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("📈 코스피 맞히기 (DB)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const k = await import("@/lib/repo/kospi");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  const monEarly = new Date("2026-11-01T20:00:00Z"); // 11/2(월) 05:00 KST
  const monLate = new Date("2026-11-02T01:00:00Z"); // 11/2(월) 10:00 KST

  it("9시 전에는 오늘 문제, 9시 뒤에는 다음 거래일 문제에 들어간다. 한 번만", async () => {
    const a = await k.pickKospi({ visitor: "a", fp: "fa", nickname: "개미", room: "주식", side: 1 }, monEarly);
    expect(a.day).toBe("2026-11-02");
    expect(a.mine).toBe(1);
    await k.pickKospi({ visitor: "b", room: "미국주식방", side: -1 }, monEarly);
    const again = await k.pickKospi({ visitor: "a", room: "주식", side: -1 }, monEarly);
    expect(again.mine).toBe(1);
    expect(again.tally).toEqual({ up: 1, down: 1 });
    const late = await k.pickKospi({ visitor: "a", room: "주식", side: -1 }, monLate);
    expect(late.day).toBe("2026-11-03");
    expect(late.last).toMatchObject({ day: "2026-11-02", mine: 1, move: null, ok: null }); // 종가 전: 결과 대기
    await expect(k.pickKospi({ visitor: "a", room: "캠핑-덕후방", side: 1 }, monEarly)).rejects.toThrow();
  });

  it("종가를 넣으면 결과가 나고, 보합은 아무도 안 센다", async () => {
    await k.putKospiClose("2026-10-30", 2500);
    await k.putKospiClose("2026-11-02", 2510); // 📈
    const a = await k.kospiCard("a", monLate);
    expect(a.last).toMatchObject({ move: 1, ok: true });
    expect(a.stats).toEqual({ wins: 1, losses: 0, streak: 1 });
    const b = await k.kospiCard("b", monLate);
    expect(b.stats).toMatchObject({ wins: 0, losses: 1, streak: 0 });
    // 맞히면 🃏 한 장 (다시 열어도 한 장)
    await k.kospiCard("a", monLate);
    const [n] = await query<{ n: number }>("SELECT count(*)::int AS n FROM quiz_notes WHERE visitor_hash = 'a' AND kind = 'trivia'");
    expect(n!.n).toBe(1);
    // 11/3 은 a 가 📉, 보합
    await k.putKospiClose("2026-11-03", 2510);
    const a2 = await k.kospiCard("a", new Date("2026-11-03T01:00:00Z"));
    expect(a2.last).toMatchObject({ day: "2026-11-03", move: 0, ok: null });
    expect(a2.stats).toEqual({ wins: 1, losses: 0, streak: 1 });
    // 지문 키도 같은 성적 (댓글 배지용)
    const [f] = await query<{ wins: number }>("SELECT wins FROM kospi_stats WHERE key = 'f:fa'");
    expect(f!.wins).toBe(1);
  });

  // 11/4 ~ 12/4 평일에 번갈아 📈(짝수 번째)·📉(홀수 번째) 종가
  const days: string[] = [];
  for (let x = "2026-11-04"; x <= "2026-12-04"; x = nextWeekday(x)) days.push(x);
  const moveAt = (i: number) => (i % 2 === 0 ? 1 : -1);

  it("연속은 틀리면 0, 순위는 5판부터", async () => {
    let close = 2510;
    for (const [i, day] of days.entries()) {
      close += moveAt(i) * 10;
      await query("INSERT INTO kospi_closes (day, close) VALUES ($1, $2)", [day, close]);
    }
    const put = (v: string, fp: string, i: number, ok: boolean, nick?: string) =>
      query("INSERT INTO kospi_picks (day, visitor_hash, fp, nickname, room, side) VALUES ($1, $2, $3, $4, '주식', $5)", [days[i], v, fp, nick ?? null, ok ? moveAt(i) : -moveAt(i)]);
    // m: 20판 중 13번 (처음 7판 틀림, 뒤 13판 맞힘) → 연속 13
    for (let i = 0; i < 20; i++) await put("m", "fm", i, i >= 7, "고수님");
    // s: 3번 맞히고 마지막에 틀림 → 연속 0, 3승 1패
    for (let i = 0; i < 4; i++) await put("s", "fs", i, i < 3);
    // few: 4판만 (순위 X)
    for (let i = 0; i < 4; i++) await put("few", "ff", i, true);
    // five: 5판 다 맞힘
    for (let i = 0; i < 5; i++) await put("five", "f5", i, true);
    await k.recomputeKospiStats();
    const st = async (key: string) => (await query<{ wins: number; losses: number; streak: number }>("SELECT wins, losses, streak FROM kospi_stats WHERE key = $1", [key]))[0];
    expect(await st("v:m")).toEqual({ wins: 13, losses: 7, streak: 13 });
    expect(await st("f:fm")).toEqual({ wins: 13, losses: 7, streak: 13 });
    expect(await st("v:s")).toEqual({ wins: 3, losses: 1, streak: 0 });

    const rank = await k.kospiRanking("five", new Date("2026-11-30T09:00:00Z"));
    expect(rank.map((r) => r.name)).toEqual(["고수님", "손님 five"]);
    expect(rank[1]).toEqual({ name: "손님 five", wins: 5, me: true });
    // 순위는 이번 달(11월 19판)만, 닉네임과 맞힌 수만
    expect(rank[0]).toEqual({ name: "고수님", wins: 12, me: false });
    expect(rank.some((r) => r.name.includes("few"))).toBe(false);
    // a(11/2 1승, 10월 아님) 는 1판이라 순위 X
    expect(rank).toHaveLength(2);
  });
  it("⭕ 투자방 동그라미: 안 골랐으면 켜고, 고른 뒤엔 끄고, 결과가 새로 나오면 다시 켠다", async () => {
    const t = new Date("2027-01-05T20:00:00Z"); // 1/6(수) 05:00 KST
    const old = new Date(Date.now() - 60_000); // 종가 넣은 시각(지금)보다 앞에 본 방
    const items = [{ slug: "주식", since: old }, { slug: "캠핑-덕후방", since: old }];
    expect(await k.kospiPending(items, "ring", t)).toEqual({ 주식: true, "캠핑-덕후방": false });
    expect((await k.kospiPending(items, null, t))["주식"]).toBe(true);
    await k.pickKospi({ visitor: "ring", room: "주식", side: 1 }, new Date("2027-01-04T20:00:00Z")); // 1/5 판
    await k.pickKospi({ visitor: "ring", room: "주식", side: 1 }, t); // 1/6 판
    expect((await k.kospiPending(items, "ring", t))["주식"]).toBe(false);
    await k.putKospiClose("2027-01-05", 2600);
    expect((await k.kospiPending(items, "ring", t))["주식"]).toBe(true);
    expect((await k.kospiPending([{ slug: "주식", since: new Date(Date.now() + 60_000) }], "ring", t))["주식"]).toBe(false);
  });
});
