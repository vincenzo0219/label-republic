import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GENDER_MIN, genderSplit, isGenderSplitRoom } from "@/lib/genderSplit";
import { ddayText, keyDates, sortStarred, starIcs } from "@/lib/singlesCalendar";
import { parsePath, roomTabKey } from "@/lib/metrics";

describe("👫 남녀 생각 차이 (10/29)", () => {
  it("남녀 각 3명 이상일 때만 나눠 보여 준다", () => {
    expect(GENDER_MIN).toBe(3);
    expect(genderSplit({ m: { A: 2, B: 0 }, f: { A: 3, B: 3 } })).toBeNull();
    expect(genderSplit({ m: { A: 3, B: 1 }, f: { A: 1, B: 2 } })).toEqual({ m: { A: 75, B: 25, n: 4 }, f: { A: 33, B: 67, n: 3 } });
    expect(genderSplit(undefined)).toBeNull();
    expect(isGenderSplitRoom("미혼남녀-만남-행사")).toBe(true);
    expect(isGenderSplitRoom("kbo-덕후방")).toBe(false);
  });
});

describe("📅 내 행사 달력 (10/29)", () => {
  const today = "2026-10-29";
  const ev = (id: string, applyStart: string | null, applyEnd: string | null, eventDate: string | null) => ({ id, title: `행사${id}`, applyStart, applyEnd, eventDate });
  it("남은 날짜만, 가까운 순", () => {
    expect(keyDates(ev("1", "2026-10-20", "2026-11-03", "2026-11-15"), today).map((k) => [k.label, k.dday])).toEqual([["접수 마감", 5], ["행사", 17]]);
    expect(keyDates(ev("2", "2026-11-01", "2026-11-10", null), today).map((k) => k.label)).toEqual(["모집 시작", "접수 마감"]);
    expect(ddayText(0)).toBe("오늘");
  });
  it("관심 행사만, 다음 날짜 순, 지난 행사는 맨 뒤", () => {
    const list = [ev("a", null, "2026-11-20", null), ev("b", null, "2026-10-30", null), ev("c", null, "2026-10-01", "2026-10-10"), ev("d", null, "2026-10-31", null)];
    expect(sortStarred(list, new Set(["a", "b", "c"]), today).map((x) => x.event.id)).toEqual(["b", "a", "c"]);
  });
  it("달력 파일: 접수 마감·행사일만 종일 일정으로", () => {
    const ics = starIcs([ev("1", "2026-11-01", "2026-11-03", "2026-11-15")], today, "https://nobangjang.com");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261103");
    expect(ics).toContain("DTEND;VALUE=DATE:20261104");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261115");
    expect(ics).not.toContain("20261101");
    expect(ics).toContain("URL:https://nobangjang.com/singles/1");
  });
});

describe("📑 탭 클릭 수 (10/29)", () => {
  it("방 주소의 탭만 짧은 키로", () => {
    expect(roomTabKey(new URLSearchParams("head=심리"))).toBe("head:심리");
    expect(roomTabKey(new URLSearchParams("tab=meet&page=2"))).toBe("tab:meet");
    expect(roomTabKey(new URLSearchParams("type=info"))).toBe("type:info");
    expect(roomTabKey(new URLSearchParams("head=<script>"))).toBeNull();
    expect(roomTabKey(new URLSearchParams("sort=latest"))).toBeNull();
    expect(parsePath("/c/%EB%AF%B8%ED%98%BC?head=%EC%8B%AC%EB%A6%AC")?.tab).toBe("head:심리");
    expect(parsePath("/posts/12?head=심리")?.tab).toBeNull();
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("👫·📑 (DB)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const votes = await import("@/lib/repo/debateVotes");
  const metrics = await import("@/lib/metrics");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  const pollPost = async (slug: string, day: string) => {
    const [c] = await query<{ id: number }>("SELECT id FROM categories WHERE slug = $1", [slug]);
    const cat = c ?? (await query<{ id: number }>("INSERT INTO categories (slug, name, description) VALUES ($1, $1, '') RETURNING id", [slug]))[0]!;
    const [p] = await query<{ id: string }>(
      "INSERT INTO posts (category_id, nickname, pw_hash, title, body, post_type, seed_key) VALUES ($1, '노방장', 'room-poll', 'poll', 'b', 'chat', $2) RETURNING id::text",
      [cat.id, `roompoll:${slug}:${day}`],
    );
    return p!.id;
  };

  it("미혼남녀방 투표만 남녀를 남기고, 안 고르고 다시 투표해도 예전 값을 둔다", async () => {
    const id = await pollPost("미혼남녀-만남-행사", "2026-10-29");
    await votes.voteDebate(id, "v1", "A", "m");
    await votes.voteDebate(id, "v2", "B", "f");
    await votes.voteDebate(id, "v3", "A");
    let t = await votes.voteDebate(id, "v1", "B");
    expect(t.human).toEqual({ A: 1, B: 2 });
    expect(t.gender).toEqual({ m: { A: 0, B: 1 }, f: { A: 0, B: 1 } });
    const recent = await votes.recentRoomPolls("미혼남녀-만남-행사");
    expect(recent[0]!.id).toBe(id);
    const other = await pollPost("kbo-덕후방", "2026-10-29");
    t = await votes.voteDebate(other, "v1", "A", "m");
    expect(t.gender).toBeUndefined();
    const [row] = await query<{ gender: string | null }>("SELECT gender FROM debate_votes WHERE post_id = $1", [other]);
    expect(row!.gender).toBeNull();
  });

  it("탭별 조회 수와 체류 중앙값", async () => {
    const now = new Date();
    const p = (raw: string) => metrics.parsePath(raw)!;
    const base = { visitorHash: "a".repeat(64), source: "internal" as const, referrerHost: null, landing: false, now };
    await metrics.recordPageView({ ...base, path: p("/c/미혼남녀-만남-행사?head=심리") });
    await metrics.recordPageView({ ...base, path: p("/c/미혼남녀-만남-행사?head=심리") });
    await metrics.recordPageView({ ...base, path: p("/c/미혼남녀-만남-행사") });
    await metrics.recordDwell({ visitorHash: "a".repeat(64), path: "/c/미혼남녀-만남-행사", categorySlug: "미혼남녀-만남-행사", tab: "head:심리", ms: 12_000, scrollPct: 50, marks: [], now });
    const day = metrics.kstDay(now);
    const rows = await metrics.roomTabStats(day, day);
    expect(rows.find((r) => r.tab === "head:심리")).toMatchObject({ room: "미혼남녀-만남-행사", views: 2, median_s: 12 });
    expect(rows.find((r) => r.tab === null)).toMatchObject({ views: 1, median_s: null });
  });
});
