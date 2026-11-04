import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CYCLE_DAYS,
  dailyQuestions,
  decodeScore,
  encodeScore,
  FIRST_SENTENCES,
  formatSentenceScore,
  gradeAnswers,
  PD_BEFORE,
  QUESTIONS_PER_DAY,
  SCORE_MAX,
  sentenceById,
} from "@/lib/firstSentenceGame";
import { formatScore, GAMES } from "@/lib/miniGames";
import { RANK_GAMES } from "@/lib/gameRank";

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

describe("📖 첫 문장 맞히기 (데이터)", () => {
  it("모두 저작권이 끝난 작품, 외국 작품은 직접 옮긴 문장", () => {
    for (const s of FIRST_SENTENCES) {
      expect(s.died, s.id).toBeLessThan(PD_BEFORE);
      if (s.group === "world") expect(s.translated, s.id).toBe(true);
      else expect(s.translated, s.id).toBeFalsy();
      expect(s.text.length, s.id).toBeGreaterThan(3);
      expect(s.text, s.id).not.toContain("—");
    }
  });
  it("id 겹침 없음, 6일 넘게 돌릴 만큼 있다", () => {
    expect(new Set(FIRST_SENTENCES.map((s) => s.id)).size).toBe(FIRST_SENTENCES.length);
    expect(FIRST_SENTENCES.length).toBeGreaterThanOrEqual(60);
    expect(CYCLE_DAYS).toBeGreaterThanOrEqual(6);
  });
});

describe("📖 첫 문장 맞히기 (하루 문제)", () => {
  it("같은 날은 늘 같은 10문제, 다른 날은 다르다", () => {
    expect(dailyQuestions("2026-11-05")).toEqual(dailyQuestions("2026-11-05"));
    expect(dailyQuestions("2026-11-05").map((q) => q.id)).not.toEqual(dailyQuestions("2026-11-06").map((q) => q.id));
    expect(dailyQuestions("2026-11-05")).toHaveLength(QUESTIONS_PER_DAY);
  });
  it("보기 4개는 서로 다르고 정답이 들어 있으며, 같은 갈래 책이다", () => {
    for (let n = 0; n < 30; n++) {
      const day = addDays("2026-11-05", n);
      for (const q of dailyQuestions(day)) {
        const s = sentenceById(q.id)!;
        expect(new Set(q.options).size).toBe(4);
        expect(q.options).toContain(s.title);
        const groups = new Set(q.options.map((t) => FIRST_SENTENCES.find((x) => x.title === t)!.group));
        expect([...groups]).toEqual([s.group]);
      }
    }
  });
  it("한 바퀴(6일) 안에서는 같은 문제가 다시 나오지 않는다", () => {
    for (const start of ["2026-11-05", addDays("2026-11-05", CYCLE_DAYS), addDays("2026-11-05", CYCLE_DAYS * 7)]) {
      const ids = Array.from({ length: CYCLE_DAYS }, (_, k) => dailyQuestions(addDays(start, k)).map((q) => q.id)).flat();
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
  it("문제에 정답(제목) 표시는 보기 말고는 없다", () => {
    const q = dailyQuestions("2026-11-05")[0]!;
    expect(Object.keys(q).sort()).toEqual(["id", "options", "text", "translated"]);
  });
});

describe("📖 첫 문장 맞히기 (점수)", () => {
  it("맞힌 개수가 먼저, 같으면 빠른 쪽이 높다", () => {
    expect(encodeScore(8, 60_000)).toBeGreaterThan(encodeScore(7, 5_000));
    expect(encodeScore(8, 40_000)).toBeGreaterThan(encodeScore(8, 41_000));
    expect(encodeScore(10, 0)).toBe(SCORE_MAX);
    expect(encodeScore(0, 10_000_000)).toBe(0);
  });
  it("되돌려 읽기·표시", () => {
    expect(decodeScore(encodeScore(8, 42_345))).toEqual({ correct: 8, tenths: 423 });
    expect(formatSentenceScore(encodeScore(8, 42_345))).toBe("8/10 · 42.3초");
    expect(formatScore("booksent", encodeScore(10, 30_000))).toBe("10/10 · 30.0초");
  });
  it("채점: 그날 정답과 비교", () => {
    const day = "2026-11-05";
    const right = dailyQuestions(day).map((q) => sentenceById(q.id)!.title);
    expect(gradeAnswers(day, right).correct).toBe(10);
    const wrong = [...right];
    wrong[0] = "없는 책";
    wrong[1] = null as unknown as string;
    expect(gradeAnswers(day, wrong).correct).toBe(8);
  });
  it("전국 랭킹 게임에 들어 있고, 브라우저 점수는 받지 않는다", () => {
    expect(RANK_GAMES).toContain("booksent");
    expect(GAMES.booksent.serverOnly).toBe(true);
    expect(GAMES.booksent.max).toBe(SCORE_MAX);
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("📖 첫 문장 맞히기 (DB)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const repo = await import("@/lib/repo/firstSentenceGame");
  const rank = await import("@/lib/repo/gameRank");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  const now = new Date("2026-11-05T03:00:00Z"); // 11/5 12:00 KST
  const tomorrow = new Date("2026-11-06T03:00:00Z");
  const titles = (at: Date) => dailyQuestions(new Date(at.getTime() + 9 * 3600_000).toISOString().slice(0, 10)).map((q) => sentenceById(q.id)!.title);

  it("오늘 첫 판만 랭킹에 남고, 다시 하기는 채점만", async () => {
    const first = await repo.playSentenceGame("v1", titles(now), 40_000, "책벌레", now);
    expect(first).toMatchObject({ correct: 10, ranked: true });
    const again = await repo.playSentenceGame("v1", titles(now), 20_000, "책벌레", now);
    expect(again.ranked).toBe(false);
    expect(await repo.todayPlay("v1", now)).toBe(first.score);
    const [{ n }] = await query<{ n: number }>("SELECT count(*)::int AS n FROM game_plays WHERE game = 'booksent' AND visitor_hash = 'v1'");
    expect(n).toBe(1);
    // 다음 날은 다시 랭킹에 들어간다
    expect((await repo.playSentenceGame("v1", titles(tomorrow), 50_000, null, tomorrow)).ranked).toBe(true);
  });

  it("너무 빠른 기록은 3초로 친다", async () => {
    const r = await repo.playSentenceGame("v2", titles(now), 100, null, now);
    expect(decodeScore(r.score).tenths).toBe(30);
  });

  it("전국 랭킹·지난 기록 도전에 그대로 쓰인다", async () => {
    const picks = titles(now);
    picks[0] = "틀린 답";
    await repo.playSentenceGame("v3", picks, 30_000, "문장수집가", now);
    const r = await rank.gameRanking("booksent", "today", "v3", now);
    expect(r.rows.map((x) => x.name)).toEqual(["익명 덕후 #v2", "책벌레", "문장수집가"]);
    expect(r.me).toMatchObject({ rank: 3, total: 3 });
    const c = await rank.challengeTarget("booksent", "v3", now);
    expect(c.target).not.toBeNull();
  });
});
