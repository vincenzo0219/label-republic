import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BUILTIN_PICKS, GENERIC_TYPE, QUIZ_EXCLUDED, builtinQuiz, isTriviaDay, isTypeDay, pct, quizProblem, scoreType, streakTier } from "@/lib/roomQuizzes";
import { chatChipTargets, chatChipText } from "@/lib/quickReplies";

describe("🧩 오늘의 1분 퀴즈 (규칙)", () => {
  it("기본 목록: 방마다 14개, 보기 2~4개·14자 이하, 정답 문제 없음", () => {
    for (const [room, list] of Object.entries(BUILTIN_PICKS)) {
      expect(list, room).toHaveLength(14);
      for (const q of list) {
        expect(quizProblem(q), `${room}: ${q.q}`).toBeNull();
        for (const o of q.options) expect(o.length, o).toBeLessThanOrEqual(14);
      }
    }
    expect(quizProblem(GENERIC_TYPE)).toBeNull();
  });
  it("날짜로 매일 바뀌고, 토요일은 유형 테스트, 제외 방은 null", () => {
    const a = builtinQuiz("캠핑-덕후방", "2026-10-29")!;
    const b = builtinQuiz("캠핑-덕후방", "2026-10-30")!;
    expect(a.kind).toBe("pick");
    expect(a).not.toEqual(b);
    expect(isTypeDay("2026-10-31")).toBe(true);
    expect(builtinQuiz("캠핑-덕후방", "2026-10-31")!.kind).toBe("type");
    // 기존 오늘의 질문 방도 같은 카드로 (10/29): 그날의 A vs B 가 공감 퀴즈로
    const k = builtinQuiz("k리그-덕후방", "2026-10-29")!;
    expect(k.kind).toBe("pick");
    expect(builtinQuiz("주식", "2026-10-29")).toBeNull();
    for (const r of QUIZ_EXCLUDED) expect(builtinQuiz(r, "2026-10-29")).toBeNull();
    expect(isTriviaDay("2026-10-29")).not.toBe(isTriviaDay("2026-10-30"));
    // 기본 정답 퀴즈가 없으면 홀수 날에도 공감 퀴즈
    expect(builtinQuiz("캠핑-덕후방", isTriviaDay("2026-10-29") ? "2026-10-29" : "2026-10-30")!.kind).toBe("pick");
  });
  it("유형 결과·비율·연속 단계", () => {
    expect(scoreType(GENERIC_TYPE, [0, 0, 1])).toBe("reader");
    expect(scoreType(GENERIC_TYPE, [1, 2, 3])).toBe("talker");
    expect(scoreType(GENERIC_TYPE, [0])).toBeNull();
    expect(pct(1, 3)).toBe(33);
    expect(pct(0, 0)).toBe(0);
    expect([streakTier(2), streakTier(3), streakTier(8), streakTier(31)]).toEqual([0, 3, 7, 30]);
  });
  it("정답 퀴즈는 출처·설명·정답 번호가 있어야", () => {
    const t = { kind: "trivia", q: "Q", options: ["a", "b"], answer: 1, why: "이유", source: "https://example.org" };
    expect(quizProblem(t)).toBeNull();
    expect(quizProblem({ ...t, source: "http://x" })).not.toBeNull();
    expect(quizProblem({ ...t, answer: 2 })).not.toBeNull();
  });
  it("수다방 버튼: 운영·AI·내 말·이미 답한 말은 빼고 최근 사람 말만", () => {
    const msgs = [
      { id: "1", nickname: "해적왕" },
      { id: "2", nickname: "노방장" },
      { id: "3", nickname: "나", is_ai_curated: false },
      { id: "4", nickname: "용인공주" },
      { id: "5", nickname: "AI봇", is_ai_curated: true },
    ];
    expect(chatChipTargets(msgs, "나", new Set())).toEqual(["4", "1"]);
    expect(chatChipTargets(msgs, "나", new Set(["4"]), 1)).toEqual(["1"]);
    expect(chatChipText("용인공주", "🙌 반가워요!")).toBe("@용인공주 🙌 반가워요!");
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("🧩 오늘의 1분 퀴즈 (DB)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const qz = await import("@/lib/repo/roomQuizzes");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("운영자 줄이 먼저, 한 브라우저 하루 한 번, 같은 선택 %", async () => {
    const day = "2026-10-29";
    expect((await qz.todayQuiz("캠핑-덕후방", day))!.source).toBe("builtin");
    expect((await qz.todayQuiz("k리그-덕후방", day))!.source).toBe("builtin");
    expect((await qz.todayQuiz("미혼남녀-만남-행사", day))!.source).toBe("poll");
    expect(await qz.todayQuiz("오늘도-장사중", day)).toBeNull();
    await qz.putRoomQuiz("캠핑-덕후방", day, { kind: "pick", q: "텐트 치고 제일 먼저?", options: ["의자", "불", "사진"] });
    await expect(qz.putRoomQuiz("오늘도-장사중", day, { kind: "pick", q: "x", options: ["a", "b"] })).rejects.toThrow();
    const t = await qz.todayQuiz("캠핑-덕후방", day);
    expect(t!.source).toBe("db");
    const a = await qz.answerQuiz("캠핑-덕후방", day, "v1", { choice: 1 }, "f1");
    expect(a.mine).toBe("1");
    const again = await qz.answerQuiz("캠핑-덕후방", day, "v1", { choice: 0 }, "f1");
    expect(again.mine).toBe("1");
    expect(again.tally.total).toBe(1);
    await qz.answerQuiz("캠핑-덕후방", day, "v2", { choice: 0 });
    expect((await qz.quizTally("캠핑-덕후방", day)).counts).toEqual({ "0": 1, "1": 1 });
    await expect(qz.answerQuiz("캠핑-덕후방", day, "v3", { choice: 9 })).rejects.toThrow();
  });

  it("🔥 연속 참여: 어제 답했으면 +1, 같은 날은 그대로, 하루 빠지면 🧊 쉬는 날(7일에 1번), 더 끊기면 1", async () => {
    expect(await qz.recordQuizDay("2026-10-27", "vs", "fs")).toBe(1);
    expect(await qz.recordQuizDay("2026-10-28", "vs", "fs")).toBe(2);
    expect(await qz.recordQuizDay("2026-10-28", "vs", "fs")).toBe(2);
    expect(await qz.recordQuizDay("2026-10-29", "vs", "fs")).toBe(3);
    expect(await qz.currentStreak("vs", "2026-10-30")).toBe(3);
    // 10/30 하루 빠짐: 쉬는 날로 이어진다
    expect(await qz.currentStreakInfo("vs", "2026-10-31")).toEqual({ current: 3, best: 3, freezeLeft: 1 });
    expect(await qz.recordQuizDay("2026-10-31", "vs", "fs")).toBe(4);
    expect((await qz.currentStreakInfo("vs", "2026-11-01")).freezeLeft).toBe(0);
    // 쉬는 날을 이미 썼으면 하루 빠져도 끊긴다
    expect(await qz.currentStreak("vs", "2026-11-02")).toBe(0);
    expect(await qz.recordQuizDay("2026-11-02", "vs", "fs")).toBe(1);
    expect(await qz.currentStreakInfo("vs", "2026-11-02")).toMatchObject({ current: 1, best: 4 });
    const dist = await qz.streakDistribution("2026-11-02");
    expect(dist.d1_2).toBeGreaterThanOrEqual(1);
  });

  it("📚 지식 노트: 정답 퀴즈는 지식 카드, 공감은 취향 기록, 방 10개면 박사", async () => {
    const day = "2026-10-29";
    await qz.putRoomQuiz("고양이-집사방", day, { kind: "trivia", q: "고양이 수염의 역할은?", options: ["감각", "장식"], answer: 0, why: "주변을 느끼는 감각 기관", source: "https://example.org/cat" });
    const r = await qz.answerQuiz("고양이-집사방", day, "nv", { choice: 0 });
    // 방에서 처음 답하면 🎁 웰컴 카드 1장 덤 (박사까지 2/10)
    expect(r.notes).toEqual({ knowledge: 2, total: 2 });
    expect(r.progress).toBe(2);
    const c = await qz.answerQuiz("캠핑-덕후방", day, "nv", { choice: 2 });
    expect(c.progress).toBe(2);
    const rooms = await qz.noteRooms("nv");
    expect(rooms.find((x) => x.room === "고양이-집사방")).toMatchObject({ knowledge: 2, taste: 0, doctor: false });
    expect(rooms.find((x) => x.room === "캠핑-덕후방")).toMatchObject({ knowledge: 1, taste: 1 });
    const cards = await qz.roomNotes("nv", "고양이-집사방");
    expect(cards.find((x) => x.kind === "trivia")).toMatchObject({ answer: "감각", correct: true, source: "https://example.org/cat" });
    expect(cards.some((x) => x.kind === "welcome")).toBe(true);
    for (let i = 1; i <= 9; i++)
      await qz.addNote("nv", "kbo-덕후방", `2026-09-${String(i).padStart(2, "0")}`, { kind: "trivia", question: `q${i}`, answer: "a", correct: true });
    expect((await qz.noteRooms("nv")).find((x) => x.room === "kbo-덕후방")!.doctor).toBe(true);
  });

  it("📊 응답률: 방문자·본 사람·답", async () => {
    const day = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    for (const v of ["a", "b", "c", "d"])
      await query("INSERT INTO page_views (day, visitor_hash, is_returning, path, category_slug, source, is_landing) VALUES ($1, $2, false, '/c/x', '필름카메라-덕후방', 'direct', true)", [day, v.repeat(64)]);
    await qz.seeQuiz("필름카메라-덕후방", day, "a");
    await qz.seeQuiz("필름카메라-덕후방", day, "b");
    await query("INSERT INTO quiz_answers (room, day, visitor_hash, choice) VALUES ('필름카메라-덕후방', $1, 'a', 0)", [day]);
    const row = (await qz.quizStats(1)).find((r) => r.room === "필름카메라-덕후방" && r.day === day)!;
    expect(row).toMatchObject({ visitors: 4, impressions: 2, answers: 1, rateVisitors: 25, rateSeen: 50 });
  });
});
