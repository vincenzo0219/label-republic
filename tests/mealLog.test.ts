import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DIET_ROOM, dietProblem, mealLine, mealShort, normalizeMeals, weeklyDaysTop } from "@/lib/dietRoom";
import { headLabel, tabHeadsFor } from "@/lib/heads";
import { roomAbuseOpts, roomHeuristicAbuse } from "@/lib/roomModeration";

describe("🥗 meal check-in helpers (10/24)", () => {
  it("formats the chat line", () => {
    expect(mealLine(["breakfast", "lunch", "dinner"], 5, false, "샐러드+닭가슴살")).toBe("🥗 오늘 3끼 인증 · 연속 5일째 · 샐러드+닭가슴살");
    expect(mealLine(["dinner", "breakfast"], 1, true)).toBe("🥗 오늘 아침·저녁 인증 · 연속 1일째 · 간식 참음 ✊");
    expect(mealShort(["lunch"], 2)).toBe("점심 · 연속 2일");
  });

  it("keeps known meals in order and drops the rest", () => {
    expect(normalizeMeals(["dinner", "x", "breakfast", "dinner"])).toEqual(["breakfast", "dinner"]);
    expect(normalizeMeals("lunch")).toEqual([]);
  });

  it("ranks this week's 꾸준왕 by days checked (Mon-Sun KST), ties to the earlier one", () => {
    const r = (k: string, day: string, at = `${day}T01:00:00Z`, nickname = k) => ({ author_key: k, nickname, day, at });
    const rows = [
      r("a", "2026-10-19"), r("a", "2026-10-20"), r("a", "2026-10-24", undefined, "A새닉"),
      r("b", "2026-10-19", "2026-10-19T00:00:00Z"), r("b", "2026-10-21"), r("b", "2026-10-22"),
      r("c", "2026-10-20"), r("d", "2026-10-21"), r("e", "2026-10-22"), r("f", "2026-10-23", "2026-10-23T09:00:00Z"),
      r("z", "2026-10-18"), r("z", "2026-10-17"), // 지난주
    ];
    const top = weeklyDaysTop(rows, "2026-10-25");
    expect(top.map((t) => [t.author_key, t.days])).toEqual([["b", 3], ["a", 3], ["c", 1], ["d", 1], ["e", 1]]);
    expect(top[1]!.nickname).toBe("A새닉");
    expect(weeklyDaysTop(rows, "2026-10-26")).toEqual([]); // 월요일은 새 주
  });

  it("scopes diet moderation to the diet room only", () => {
    expect(roomAbuseOpts(DIET_ROOM)).toEqual({ invest: false, diet: true });
    expect(roomAbuseOpts("적립식-투자방")).toEqual({ invest: true, diet: false });
    expect(roomAbuseOpts("반려견-덕후방")).toEqual({ invest: false, diet: false });
    for (const bad of ["물단식 3일 챌린지 같이 하실 분", "먹토 하면 안 찐대요", "나비약 처방 없이 구해요", "프로아나 친구 구해요", "뼈말라 자극 사진"])
      expect(roomHeuristicAbuse(DIET_ROOM, bad)?.category, bad).toBe("diet");
    expect(roomHeuristicAbuse("반려견-덕후방", "먹토 하면 안 찐대요")).toBeNull();
    expect(dietProblem("주식", "단식 3일 챌린지")).toBeNull();
    for (const ok of ["오늘 3끼 다 먹었어요", "샐러드+닭가슴살", "어제 과식해서 오늘은 가볍게", "간헐적 단식 16:8 하는 중", "폭식하고 나서 너무 힘들어요"])
      expect(dietProblem(DIET_ROOM, ok), ok).toBeNull();
  });

  it("relabels 📸 자랑 as 📸 식단 인증 for this room only", () => {
    expect(tabHeadsFor(DIET_ROOM).map((h) => h.label)).toEqual(["📸 식단 인증", "🎫 행사·할인"]);
    expect(headLabel("자랑", DIET_ROOM)).toBe("📸 식단 인증");
    expect(tabHeadsFor("반려견-덕후방")[0]!.label).toBe("📸 자랑");
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("meal check-in (DB)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { mealSchema, mealSummary, submitMeal } = await import("@/lib/repo/mealLog");
  const { createComment } = await import("@/lib/repo/comments");
  const ROOM = DIET_ROOM;
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
    await query("INSERT INTO categories (slug, name, description) VALUES ($1, '다이어트 식단 함께해요.', '성공하자! 다이어트!!') ON CONFLICT DO NOTHING", [ROOM]);
    await query("INSERT INTO categories (slug, name, description) VALUES ('반려견-덕후방', '반려견', '') ON CONFLICT DO NOTHING");
  });
  afterAll(async () => {
    await pool().end();
  });

  const at = (day: string, hh = "12") => new Date(`${day}T${hh}:00:00+09:00`);
  const base = { room: ROOM, pin: "1234" };

  it("requires at least one meal chip", async () => {
    const ok = { room: ROOM, nickname: "식단러", pw: "1234" };
    expect(mealSchema.safeParse({ ...ok, meals: [] }).success).toBe(false);
    expect(mealSchema.safeParse({ ...ok, meals: ["snack"] }).success).toBe(false);
    expect(mealSchema.safeParse({ ...ok }).success).toBe(false);
    expect(mealSchema.safeParse({ ...ok, meals: ["lunch"], weight: 60 }).data).not.toHaveProperty("weight"); // 몸무게는 받지 않는다
    expect(mealSchema.safeParse({ ...ok, meals: ["lunch"], note: "가".repeat(41) }).success).toBe(false);
    await expect(submitMeal({ ...base, nickname: "식단러", meals: [] })).rejects.toMatchObject({ status: 400 });
    await expect(submitMeal({ ...base, nickname: "식단러", meals: ["snack"] })).rejects.toMatchObject({ status: 400 });
    await expect(submitMeal({ ...base, room: "반려견-덕후방", nickname: "식단러", meals: ["lunch"] })).rejects.toMatchObject({ status: 404 });
  });

  it("one entry per identity per KST day: a second submit updates it", async () => {
    const first = await submitMeal({ ...base, nickname: "식단러", meals: ["breakfast", "lunch"], note: "샐러드" }, at("2026-10-22"));
    expect(first.updated).toBe(false);
    expect(first.entry).toMatchObject({ meals: ["breakfast", "lunch"], streak: 1, day: "2026-10-22" });
    const again = await submitMeal({ ...base, nickname: "식단 러", meals: ["breakfast", "lunch", "dinner"], snack: true, note: "샐러드+닭가슴살" }, at("2026-10-22", "23"));
    expect(again.updated).toBe(true);
    expect(again.entry.comment_id).toBe(first.entry.comment_id);
    expect(await query("SELECT dinner, snack_skip FROM meal_logs WHERE author_key = '식단러'")).toEqual([{ dinner: true, snack_skip: true }]);
    const [c] = await query<{ body: string; seed_key: string }>("SELECT c.body, p.seed_key FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.id = $1", [first.entry.comment_id]);
    expect(c).toEqual({ body: "🥗 오늘 3끼 인증 · 연속 1일째 · 간식 참음 ✊ · 샐러드+닭가슴살", seed_key: `roomchat:${ROOM}` });
  });

  it("streak counts consecutive KST days and resets after a gap", async () => {
    // 10/23 00:30 KST 는 UTC 로 10/22
    expect((await submitMeal({ ...base, nickname: "식단러", meals: ["lunch"] }, new Date("2026-10-22T15:30:00Z"))).entry.streak).toBe(2);
    const third = await submitMeal({ ...base, nickname: "식단러", meals: ["dinner"], note: "010-1234-5678" }, at("2026-10-24"));
    expect(third.entry.streak).toBe(3);
    expect(third.entry.note).toBe("[개인정보 가림]");
    expect((await submitMeal({ ...base, nickname: "식단러", meals: ["lunch"] }, at("2026-10-26"))).entry.streak).toBe(1);
  });

  it("weekly 꾸준왕 counts days Mon-Sun, today's count, and skips hidden entries", async () => {
    await submitMeal({ ...base, nickname: "새싹", pin: "1111", meals: ["lunch"] }, at("2026-10-24"));
    await submitMeal({ ...base, nickname: "지난주", pin: "2222", meals: ["lunch"] }, at("2026-10-18"));
    const hidden = await submitMeal({ ...base, nickname: "가림", pin: "3333", meals: ["lunch"] }, at("2026-10-24"));
    await query("UPDATE comments SET ai_hidden_at = now(), ai_hidden_reason = 'diet' WHERE id = $1", [hidden.entry.comment_id]);
    const s = await mealSummary(ROOM, at("2026-10-24", "20"));
    expect(s.today).toBe(2);
    expect(s.top.map((t) => [t.nickname, t.days])).toEqual([["식단러", 3], ["새싹", 1]]); // 닉네임은 가장 최근 것
    expect(s.recent.map((r) => [r.nickname, r.meals, r.streak])).toEqual([["새싹", ["lunch"], 1], ["식단러", ["dinner"], 3], ["식단러", ["lunch"], 2]]);
  });

  it("hides extreme-dieting comments in the diet room only", async () => {
    const [diet] = await query<{ id: string }>("SELECT id::text FROM posts WHERE seed_key = $1", [`roomchat:${ROOM}`]);
    const bad = await createComment(diet!.id, { nickname: "누구", pin: "4444", body: "물단식 3일 챌린지 같이 해요" });
    expect(bad.hidden_reason).toBe("diet");
    const { ensureRoomChat } = await import("@/lib/repo/roomChat");
    const dog = await ensureRoomChat("반려견-덕후방");
    const elsewhere = await createComment(dog!.postId, { nickname: "누구", pin: "4444", body: "물단식 3일 챌린지 같이 해요" });
    expect(elsewhere.hidden_reason).toBeNull();
  });
});
