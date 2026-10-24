import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { badgeOf, identityKey, ROOM_BADGES } from "@/lib/badges";
import { kstDay, streakAt, weekEnd, weekStart, weeklyTop, writingLine } from "@/lib/writingLog";

describe("writing log helpers (10/24)", () => {
  it("counts consecutive KST days ending on a day", () => {
    const days = ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-24"];
    expect(streakAt(days, "2026-10-22")).toBe(3);
    expect(streakAt(days, "2026-10-24")).toBe(1);
    expect(streakAt(days, "2026-10-23")).toBe(0);
    expect(streakAt(["2026-09-30", "2026-10-01"], "2026-10-01")).toBe(2); // 달이 바뀌어도
  });

  it("uses KST for today and Monday-Sunday weeks", () => {
    expect(kstDay(new Date("2026-10-24T14:59:00Z"))).toBe("2026-10-24");
    expect(kstDay(new Date("2026-10-24T15:00:00Z"))).toBe("2026-10-25");
    // 2026-10-24 는 토요일
    expect(weekStart("2026-10-24")).toBe("2026-10-19");
    expect(weekEnd("2026-10-24")).toBe("2026-10-25");
    expect(weekStart("2026-10-25")).toBe("2026-10-19"); // 일요일은 그 주 끝
    expect(weekStart("2026-10-26")).toBe("2026-10-26"); // 월요일은 새 주
  });

  it("ranks this week's top 5 by total, ties to the earlier writer", () => {
    const r = (k: string, chars: number, day: string, at = `${day}T01:00:00Z`, nickname = k) => ({ author_key: k, nickname, chars, day, at });
    const rows = [
      r("a", 1000, "2026-10-19"), r("a", 1500, "2026-10-24", undefined, "A새닉"),
      r("b", 2500, "2026-10-20", "2026-10-20T00:00:00Z"),
      r("c", 2500, "2026-10-21"),
      r("d", 100, "2026-10-22"), r("e", 50, "2026-10-22"), r("f", 10, "2026-10-22"),
      r("z", 99999, "2026-10-18"), // 지난주
    ];
    const top = weeklyTop(rows, "2026-10-24");
    expect(top.map((t) => [t.author_key, t.chars])).toEqual([["a", 2500], ["b", 2500], ["c", 2500], ["d", 100], ["e", 50]]);
    expect(top[0]!.nickname).toBe("A새닉");
    expect(top).toHaveLength(5);
  });

  it("formats the chat line", () => {
    expect(writingLine(2300, 3)).toBe("✍️ 오늘 2,300자 · 연속 3일째");
    expect(writingLine(100000, 1, "로판 12화")).toBe("✍️ 오늘 100,000자 · 연속 1일째 · 로판 12화");
  });

  it("looks up badges by identity key", () => {
    expect(identityKey(" 글 쓰는 Cat ")).toBe("글쓰는cat");
    expect(badgeOf({ 글쓰는cat: "🐉 판타지 설계자" }, "글쓰는 CAT")).toBe("🐉 판타지 설계자");
    expect(badgeOf({}, "constructor")).toBeUndefined();
    expect(ROOM_BADGES["작가지망생방"]!.label("fantasy")).toBe("🐉 판타지 설계자");
    expect(ROOM_BADGES["작가지망생방"]!.label("toString")).toBeUndefined();
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("writing log + badges (DB)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { submitWriting, weeklyWriters, recentWriting } = await import("@/lib/repo/writingLog");
  const { badgeFor, badgesFor, saveTestResult } = await import("@/lib/repo/badges");
  const ROOM = "작가지망생방";
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
    await query("INSERT INTO categories (slug, name, description) VALUES ($1, $1, '') ON CONFLICT DO NOTHING", [ROOM]);
  });
  afterAll(async () => {
    await pool().end();
  });

  const at = (day: string, hh = "12") => new Date(`${day}T${hh}:00:00+09:00`);

  it("one entry per identity per KST day: a second submit updates it", async () => {
    const first = await submitWriting({ room: ROOM, nickname: "새벽작가", pin: "1234", chars: 1200, note: "회귀물 3화" }, at("2026-10-22"));
    expect(first.updated).toBe(false);
    expect(first.entry).toMatchObject({ chars: 1200, streak: 1, day: "2026-10-22" });
    const again = await submitWriting({ room: ROOM, nickname: "새벽 작가", pin: "1234", chars: 2300 }, at("2026-10-22", "23"));
    expect(again.updated).toBe(true);
    expect(again.entry.comment_id).toBe(first.entry.comment_id);
    const logs = await query<{ chars: number }>("SELECT chars FROM writing_logs WHERE author_key = '새벽작가'");
    expect(logs).toEqual([{ chars: 2300 }]);
    const [c] = await query<{ body: string }>("SELECT body FROM comments WHERE id = $1", [first.entry.comment_id]);
    expect(c!.body).toBe("✍️ 오늘 2,300자 · 연속 1일째");
    // 다른 방은 안 된다
    await expect(submitWriting({ room: "없는방", nickname: "새벽작가", pin: "1234", chars: 1 })).rejects.toMatchObject({ status: 404 });
  });

  it("streak grows on consecutive KST days and resets after a gap", async () => {
    // 10/23 00:30 KST 는 UTC 로 10/22 — 그래도 KST 10/23
    expect((await submitWriting({ room: ROOM, nickname: "새벽작가", pin: "1234", chars: 500 }, new Date("2026-10-22T15:30:00Z"))).entry.streak).toBe(2);
    const third = await submitWriting({ room: ROOM, nickname: "새벽작가", pin: "1234", chars: 800, note: "010-1234-5678" }, at("2026-10-24"));
    expect(third.entry.streak).toBe(3);
    expect(third.entry.note).toBe("[개인정보 가림]");
    expect((await submitWriting({ room: ROOM, nickname: "새벽작가", pin: "1234", chars: 1 }, at("2026-10-26"))).entry.streak).toBe(1);
  });

  it("weekly top 5 sums Mon-Sun and skips hidden entries", async () => {
    await submitWriting({ room: ROOM, nickname: "밤작가", pin: "1111", chars: 5000 }, at("2026-10-20"));
    await submitWriting({ room: ROOM, nickname: "지난주", pin: "2222", chars: 90000 }, at("2026-10-18"));
    const hidden = await submitWriting({ room: ROOM, nickname: "가림", pin: "3333", chars: 9000 }, at("2026-10-21"));
    await query("UPDATE comments SET ai_hidden_at = now(), ai_hidden_reason = 'spam' WHERE id = $1", [hidden.entry.comment_id]);
    const top = await weeklyWriters(ROOM, at("2026-10-24"));
    expect(top.map((t) => [t.nickname, t.chars])).toEqual([["밤작가", 5000], ["새벽작가", 3600]]);
    const recent = await recentWriting(ROOM, at("2026-10-24"));
    expect(recent.map((r) => [r.nickname, r.chars, r.streak])).toEqual([["새벽작가", 800, 3], ["새벽작가", 500, 2]]);
  });

  it("stores test results per identity and returns room badges", async () => {
    expect(await saveTestResult("writer", "새벽 작가", "fantasy")).toBe(true);
    expect(await saveTestResult("writer", "밤작가", "murim")).toBe(true);
    expect(await saveTestResult("writer", "밤작가", "rofan")).toBe(true); // 마지막 결과
    expect(await saveTestResult("writer", "밤작가", "nope")).toBe(false);
    expect(await saveTestResult("nope", "밤작가", "fantasy")).toBe(false);
    expect(await badgeFor(ROOM, "새벽작가")).toBe("🐉 판타지 설계자");
    expect(await badgesFor(ROOM, ["밤작가", "모르는사람"])).toEqual({ 밤작가: "👑 로판 빙의러" });
    expect(await badgesFor("반려견-덕후방", ["밤작가"])).toEqual({});
  });

  it("migration backfills badges from writer test results already in the room chat", async () => {
    const [p] = await query<{ id: string }>("SELECT id::text FROM posts WHERE seed_key = 'roomchat:작가지망생방'");
    await query("INSERT INTO comments (post_id, nickname, pw_hash, body) VALUES ($1, '옛날작가', 'x', '✍️ 장르 작가 테스트: ⚔️ 무협 고수 / 쓰는 중: -')", [p!.id]);
    await query(readFileSync(path.join(process.cwd(), "db", "migrations", "082_writing_logs_badges.sql"), "utf8"));
    expect(await badgeFor(ROOM, "옛날작가")).toBe("⚔️ 무협 고수");
    expect(await badgeFor(ROOM, "밤작가")).toBe("👑 로판 빙의러"); // 이미 있는 결과는 그대로
  });
});
