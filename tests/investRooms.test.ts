import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { headLabel, tabHeadsFor } from "@/lib/heads";
import { INVEST_ERRORS, investProblem, isInvestRoom } from "@/lib/investRooms";
import { kstDate, kstTime, splitEvents, tonightWindow, type MarketEvent } from "@/lib/marketEvents";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RadarCard } from "@/components/RadarCard";
import { radarAsOf, radarRows, radarSchema, radarVisible } from "@/lib/marketRadar";
import { addMonths, isBucket, isReminderDay, kstMonth, monthStreakAt, savingsLine } from "@/lib/savingsLog";

const US = "미국주식방";
const SAVE = "적립식-투자방";

describe("invest room link rule (10/24)", () => {
  it("covers the two new rooms and the user-made 주식 room only", () => {
    expect([US, SAVE, "주식"].every(isInvestRoom)).toBe(true);
    expect(isInvestRoom("반려견-덕후방")).toBe(false);
    expect(isInvestRoom(undefined)).toBe(false);
  });

  it.each([
    ["https://open.kakao.com/o/abc123", "link"],
    ["오픈카톡 open. kakao .com/o/x", "link"],
    ["t.me/stockvip 로", "link"],
    ["https://telegram.me/abc", "link"],
    ["텔레그램 채널 있어요", "link"],
    ["band.us/@stock", "link"],
    ["discord.gg/abcd", "link"],
    ["https://discord.com/invite/xyz", "link"],
    ["무료 리딩방 운영합니다", "leading"],
    ["오픈채팅방 들어오세요", "leading"],
    ["단톡방 초대해 드려요", "leading"],
    ["VIP 추천방 선착순", "leading"],
    ["문의 010-1234-5678", "phone"],
    ["02-123-4567 로 연락", "phone"],
    ["070 1234 5678", "phone"],
  ] as const)("blocks %s in stock rooms", (text, kind) => {
    expect(investProblem(US, "제목", text)).toBe(INVEST_ERRORS[kind]);
    expect(investProblem(SAVE, text)).toBe(INVEST_ERRORS[kind]);
    expect(investProblem("주식", text)).toBe(INVEST_ERRORS[kind]);
  });

  it("allows the same text in other rooms", () => {
    expect(investProblem("반려견-덕후방", "https://open.kakao.com/o/abc 오픈채팅방 들어오세요 010-1234-5678")).toBeNull();
    expect(investProblem(undefined, "t.me/abc")).toBeNull();
  });

  it("keeps ordinary investing talk, official links, dates and amounts", () => {
    for (const t of [
      "FOMC 결과는 한국 시간 10/29 03:00 https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
      "2026-11-26 추수감사절 휴장, 11/27 조기 폐장",
      "이번 달 300,000원 적립, 수익률 -2.5%",
      "S&P500 ETF 7개월째",
      "1,500,000원 넘으면 공제",
      "텔레비전 뉴스에서 봤어요",
    ])
      expect(investProblem(US, t)).toBeNull();
  });
});

describe("invest room tabs (10/24)", () => {
  it("relabels tabs per room and keeps the head keys", () => {
    expect(tabHeadsFor(US)).toEqual([{ key: "행사", label: "📅 일정" }, { key: "자랑", label: "📒 매매일지" }]);
    expect(tabHeadsFor("주식")).toEqual([{ key: "행사", label: "📅 일정" }, { key: "자랑", label: "📒 매매일지" }]);
    expect(tabHeadsFor(SAVE)).toEqual([{ key: "자랑", label: "📒 적립 인증" }, { key: "혜택", label: "🎁 혜택" }]);
    expect(headLabel("자랑", US)).toBe("📒 매매일지");
    expect(headLabel("자랑")).toBe("📸 자랑");
    // 다른 방은 그대로
    expect(tabHeadsFor("반려견-덕후방").map((h) => h.label)).toEqual(["📸 자랑", "🎫 행사·할인"]);
  });
});

describe("monthly savings check-in rules (10/24)", () => {
  it("uses KST calendar months", () => {
    expect(kstMonth(new Date("2026-10-31T14:59:00Z"))).toBe("2026-10-01");
    expect(kstMonth(new Date("2026-10-31T15:00:00Z"))).toBe("2026-11-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
    expect(addMonths("2026-12-01", 1)).toBe("2027-01-01");
  });

  it("counts consecutive months and resets after a gap", () => {
    const m = ["2025-11-01", "2025-12-01", "2026-01-01", "2026-03-01"];
    expect(monthStreakAt(m, "2026-01-01")).toBe(3); // 해가 바뀌어도
    expect(monthStreakAt(m, "2026-03-01")).toBe(1);
    expect(monthStreakAt(m, "2026-02-01")).toBe(0);
  });

  it("validates buckets and reminder days", () => {
    expect(["lt10", "10to30", "30to50", "50plus"].every(isBucket)).toBe(true);
    expect(isBucket("300000")).toBe(false);
    expect(isBucket(undefined)).toBe(false);
    expect([1, 28].every(isReminderDay)).toBe(true);
    expect([0, 29, 31, 1.5].some(isReminderDay)).toBe(false);
    expect(savingsLine(7)).toBe("💰 이번 달 적립 완료 · 연속 7개월");
    expect(savingsLine(1, "S&P500 ETF")).toBe("💰 이번 달 적립 완료 · 연속 1개월 · S&P500 ETF");
  });
});

describe("tonight's US market card (10/24)", () => {
  const ev = (id: string, starts_at: string): MarketEvent => ({ id, market: "us", starts_at, title: id, source_url: "" });
  const events = [
    ev("fomc", "2026-10-28T14:00:00-04:00"), // KST 10/29 03:00
    ev("msft", "2026-10-28T14:30:00-07:00"), // KST 10/29 06:30
    ev("amzn", "2026-10-29T14:00:00-07:00"), // KST 10/30 06:00
    ev("cpi", "2026-11-10T08:30:00-05:00"), // KST 11/10 22:30
    ev("old", "2026-10-27T10:00:00-04:00"),
  ];

  it("tonight is KST noon to next noon", () => {
    const w = tonightWindow(new Date("2026-10-28T13:00:00+09:00"));
    expect(w.start.toISOString()).toBe("2026-10-28T03:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-10-29T03:00:00.000Z");
    // 새벽 1시(KST)에 보면 아직 "어제 밤" 이 아니라 그날 낮 12시부터의 밤
    expect(tonightWindow(new Date("2026-10-29T01:00:00+09:00")).start.toISOString()).toBe("2026-10-29T03:00:00.000Z");
  });

  it("splits tonight and the next 7 days in time order", () => {
    const { tonight, week } = splitEvents(events, new Date("2026-10-28T09:00:00+09:00"));
    expect(tonight.map((e) => e.id)).toEqual(["fomc", "msft"]);
    expect(week.map((e) => e.id)).toEqual(["amzn"]);
    const later = splitEvents(events, new Date("2026-11-10T20:00:00+09:00"));
    expect(later.tonight.map((e) => e.id)).toEqual(["cpi"]);
  });

  it("formats KST time and date", () => {
    expect(kstTime("2026-10-28T14:00:00-04:00")).toBe("03:00");
    expect(kstDate("2026-11-02T14:00:00-08:00")).toBe("11/3(화)");
  });
});

describe("내일장 레이더 (10/24)", () => {
  const kst = (s: string) => new Date(`${s}+09:00`);

  it("hides numbers older than 24h on KST weekdays, keeps Friday numbers over the weekend", () => {
    const fri = { asOf: "2026-10-23T07:40:00+09:00" };
    expect(radarVisible(fri, kst("2026-10-23T20:00:00"))).toBe(true);
    expect(radarVisible(fri, kst("2026-10-24T09:00:00"))).toBe(true); // 토요일
    expect(radarVisible(fri, kst("2026-10-25T22:00:00"))).toBe(true); // 일요일
    expect(radarVisible(fri, kst("2026-10-26T07:39:00"))).toBe(false); // 월요일 아침, 아직 안 바뀜
    expect(radarVisible({ asOf: "2026-10-26T07:40:00+09:00" }, kst("2026-10-26T08:00:00"))).toBe(true);
    expect(radarVisible({ asOf: "2026-10-27T07:40:00+09:00" }, kst("2026-10-28T07:41:00"))).toBe(false);
    expect(radarVisible(null)).toBe(false);
    expect(radarVisible({ asOf: "2026-10-30T07:40:00+09:00" }, kst("2026-10-28T07:41:00"))).toBe(false); // 미래 시각
  });

  it("renders only the rows that are present", () => {
    const r = radarSchema.parse({ asOf: "2026-10-26T07:40:00+09:00", kospiNight: { pct: -0.42 }, flows: { foreign: -1234 } });
    expect(radarRows(r)).toEqual([
      { label: "코스피200 야간선물", value: "−0.42%" },
      { label: "전일 순매수", value: "외국인 −1,234억" },
    ]);
    const full = radarSchema.parse({
      asOf: "2026-10-26T07:40:00+09:00",
      indices: [{ name: "다우", pct: 0.5 }, { name: "S&P500", pct: 0 }, { name: "나스닥", pct: 1.234 }],
      usdkrw: { value: 1385.5, change: 2.3 },
      adrs: [{ name: "쿠팡" }, { name: "포스코", pct: 1.1 }],
      flows: { foreign: 500, institution: -20 },
      cause: { text: "보도: 반도체 업종 강세", url: "https://example.com/a" },
      sources: [{ label: "출처", url: "https://example.com/s" }],
    });
    expect(radarRows(full).map((x) => x.value)).toEqual([
      "다우 +0.50% · S&P500 0.00% · 나스닥 +1.23%",
      "1,385.5 (+2.3)",
      "쿠팡 · 포스코 +1.10%",
      "외국인 +500억 · 기관 −20억",
    ]);
    expect(radarAsOf(full.asOf)).toBe("10/26 07:40 기준");
    const now = kst("2026-10-26T08:00:00");
    const html = renderToStaticMarkup(createElement(RadarCard, { radar: r, now }));
    expect(html).toContain("내일장 레이더");
    expect(html).toContain("10/26 07:40 기준");
    expect(html).toContain("코스피200 야간선물");
    expect(html).not.toContain("원/달러");
    expect(html).not.toContain("ADR");
    expect(renderToStaticMarkup(createElement(RadarCard, { radar: r, now: kst("2026-10-27T08:00:00") }))).toBe("");
    expect(radarSchema.safeParse({ asOf: "2026-10-26 07:40" }).success).toBe(false);
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("invest rooms (DB)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { createPost } = await import("@/lib/repo/posts");
  const { createComment, updateComment } = await import("@/lib/repo/comments");
  const { submitSavings, savingsSummary } = await import("@/lib/repo/savingsLog");
  const { addEvent, upcomingEvents } = await import("@/lib/repo/marketEvents");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
    for (const slug of [US, SAVE, "반려견-덕후방"]) await query("INSERT INTO categories (slug, name, description) VALUES ($1, $1, '') ON CONFLICT DO NOTHING", [slug]);
  });
  afterAll(async () => {
    await pool().end();
  });

  const post = (categorySlug: string, body: string) =>
    createPost({ categorySlug, nickname: "테스터", pin: "1234", title: "제목입니다", body, summary: null, noSummary: true, postType: "chat" });

  it("blocks messenger links in stock room posts and comments, allows them elsewhere", async () => {
    await expect(post(US, "들어오세요 https://open.kakao.com/o/abc123")).rejects.toMatchObject({ status: 400, message: INVEST_ERRORS.link });
    await expect(post(SAVE, "무료 리딩방 모집해요 선착순")).rejects.toMatchObject({ status: 400, message: INVEST_ERRORS.leading });
    const dog = await post("반려견-덕후방", "산책 모임 https://open.kakao.com/o/abc123");
    expect(dog.id).toBeTruthy();
    const ok = await post(US, "11월 FOMC 일정 정리했어요. 공식 링크 첨부");
    await expect(createComment(ok.id, { nickname: "댓글러", pin: "1234", body: "t.me/vipstock 으로 오세요" })).rejects.toMatchObject({ status: 400 });
    await expect(createComment(ok.id, { nickname: "댓글러", pin: "1234", body: "문의 010-1234-5678" })).rejects.toMatchObject({ message: INVEST_ERRORS.phone });
    const c = await createComment(ok.id, { nickname: "댓글러", pin: "1234", body: "정리 고마워요" });
    await expect(updateComment(String(c.id), "fp", "1234", "band.us/@vip 로 오세요")).rejects.toMatchObject({ status: 400 });
    const dc = await createComment(dog.id, { nickname: "댓글러", pin: "1234", body: "t.me/dogwalk 같이 가요" });
    expect(dc.id).toBeTruthy();
  });

  const at = (day: string) => new Date(`${day}T12:00:00+09:00`);

  it("one check-in per KST month, streak over consecutive months, posts to the room chat", async () => {
    const first = await submitSavings({ room: SAVE, nickname: "월급쟁이", pin: "1234", bucket: "10to30", note: "S&P500 ETF" }, at("2026-09-05"));
    expect(first).toMatchObject({ updated: false, entry: { month: "2026-09-01", streak: 1, bucket: "10to30" } });
    const again = await submitSavings({ room: SAVE, nickname: "월급 쟁이", pin: "1234", bucket: null }, at("2026-09-30"));
    expect(again.updated).toBe(true);
    expect(again.entry.comment_id).toBe(first.entry.comment_id);
    expect(await query("SELECT 1 FROM savings_logs WHERE author_key = '월급쟁이'")).toHaveLength(1);
    const oct = await submitSavings({ room: SAVE, nickname: "월급쟁이", pin: "1234" }, at("2026-10-24"));
    expect(oct.entry.streak).toBe(2);
    const [c] = await query<{ body: string; slug: string }>(
      "SELECT c.body, p.seed_key AS slug FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.id = $1",
      [oct.entry.comment_id],
    );
    expect(c).toEqual({ body: "💰 이번 달 적립 완료 · 연속 2개월", slug: `roomchat:${SAVE}` });
    expect((await submitSavings({ room: SAVE, nickname: "월급쟁이", pin: "1234" }, at("2026-12-01"))).entry.streak).toBe(1);
    expect((await savingsSummary(SAVE, at("2026-10-24"))).count).toBe(1);
    await expect(submitSavings({ room: SAVE, nickname: "월급쟁이", pin: "1234", note: "open.kakao.com/o/x" }, at("2026-12-02"))).rejects.toMatchObject({ status: 400 });
    await expect(submitSavings({ room: US, nickname: "월급쟁이", pin: "1234" })).rejects.toMatchObject({ status: 404 });
  });

  it("seeds verified schedule items and lists tonight + 7 days", async () => {
    const seeded = await upcomingEvents(["us"], new Date("2026-10-28T09:00:00+09:00"));
    expect(seeded.map((e) => e.title)).toEqual(["FOMC 금리 결정", "알파벳 실적 발표", "마이크로소프트 실적 발표", "아마존 실적 발표", "애플 실적 발표"]);
    await addEvent({ market: "kr", startsAt: "2026-10-28T09:00:00+09:00", title: "국내 일정", sourceUrl: "https://example.com" });
    expect((await upcomingEvents(["us"], new Date("2026-10-28T09:00:00+09:00"))).some((e) => e.market === "kr")).toBe(false);
    expect((await upcomingEvents(["us", "kr"], new Date("2026-10-27T09:00:00+09:00"))).some((e) => e.market === "kr")).toBe(true);
  });
});
