import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { correctRate, predictBadge, predictionProblem, resultPushText, streakBadge, streakOf, weekStart } from "@/lib/predictions";

// 🎯 승부 예측 (11/2 대표님 "보상은 배지, 그리고 스코어까지")
describe("predictions rules", () => {
  it("counts streaks from the latest result and badges from 3", () => {
    expect(streakOf([true, true, false, true])).toBe(2);
    expect(streakOf([true, true, true])).toBe(3);
    expect(streakOf([])).toBe(0);
    expect(streakBadge(2)).toBeUndefined();
    expect(streakBadge(3)).toBe("🎯3연속");
    expect(streakBadge(5, "📈")).toBe("📈5연속");
  });
  it("starts the week on Monday 00:00 KST", () => {
    // 11/2 (월) 10:00 KST
    expect(weekStart(new Date("2026-11-02T01:00:00Z"))).toBe("2026-11-01T15:00:00.000Z");
    // 11/1 (일) 23:00 KST → 지난주 월요일 10/26
    expect(weekStart(new Date("2026-11-01T14:00:00Z"))).toBe("2026-10-25T15:00:00.000Z");
  });
  it("rewards: badge priority, push text, correct rate (11/3)", () => {
    expect(predictBadge({ streak: 0, recentWin: false, lastWeekTop: false })).toBeUndefined();
    expect(predictBadge({ streak: 1, recentWin: true, lastWeekTop: false })).toBe("🎯적중");
    expect(predictBadge({ streak: 4, recentWin: true, lastWeekTop: false })).toBe("🎯4연속");
    expect(predictBadge({ streak: 1, recentWin: true, lastWeekTop: true })).toBe("🏆지난주 1등");
    expect(predictBadge({ streak: 3, recentWin: true, lastWeekTop: true })).toBe("🏆지난주 1등 🎯3연속");
    expect(resultPushText("1차전 승자는?", ["KT", "삼성"], 0, 0, 10)).toEqual({ title: "🎯 맞혔어요! +10점", body: "1차전 승자는" });
    expect(resultPushText("K리그 제주 vs 광주, 결과는?", ["제주 승", "무", "광주 승"], 2, 0, 10).body).toBe("K리그 제주 vs 광주 · 정답 광주 승");
    expect(correctRate([1, 2], 1)).toBeNull();
    expect(correctRate([3, 1, 1], 0)).toBe(60);
  });
  it("validates operator questions", () => {
    const ok = { room: "kbo-덕후방", title: "한국시리즈 1차전 승자는?", options: ["KT", "삼성"], closesAt: "2026-11-03T09:30:00Z" };
    expect(predictionProblem(ok)).toBeNull();
    expect(predictionProblem({ ...ok, room: "주식" })).not.toBeNull();
    expect(predictionProblem({ ...ok, options: ["KT"] })).not.toBeNull();
    expect(predictionProblem({ ...ok, options: ["KT", "KT"] })).not.toBeNull();
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("predictions (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const repo = await import("@/lib/repo/predictions");
  const { badgesFor } = await import("@/lib/repo/badges");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  it("one pick per browser before closing, points and streak after results, weekly board, badge", async () => {
    const now = new Date("2026-11-02T03:00:00Z");
    const mk = (n: number) =>
      repo.createPrediction({ room: "kbo-덕후방", title: `${n}차전 승자는?`, options: ["KT", "삼성"], closesAt: "2026-11-02T09:00:00Z", seedKey: `kbo:${n}` });
    const qs = [await mk(1), await mk(2), await mk(3)];
    expect((await mk(1)).id).toBe(qs[0]!.id); // 같은 seed 는 한 번
    for (const q of qs) await repo.pickPrediction({ id: q.id, visitor: "v1", nickname: "수원 직관러", choice: 0 }, now);
    // 두 번째 고르기는 무시
    const again = await repo.pickPrediction({ id: qs[0]!.id, visitor: "v1", nickname: "수원 직관러", choice: 1 }, now);
    expect(again.open.find((o) => o.id === qs[0]!.id)?.mine).toBe(0);
    await repo.pickPrediction({ id: qs[0]!.id, visitor: "v2", nickname: "대구", choice: 1 }, now);
    // 마감 뒤에는 못 고른다
    await expect(repo.pickPrediction({ id: qs[1]!.id, visitor: "v3", choice: 0 }, new Date("2026-11-02T10:00:00Z"))).rejects.toThrow();
    for (const q of qs) await repo.resolvePrediction(q.id, 0);
    const card = await repo.predictCard("kbo-덕후방", "v1", "수원 직관러", new Date("2026-11-02T12:00:00Z"));
    expect(card.me).toEqual({ score: 30, wins: 3, losses: 0, streak: 3 });
    expect(card.board[0]).toMatchObject({ name: "수원 직관러", score: 30, me: true });
    expect(card.board.find((b) => b.name === "대구")).toBeUndefined(); // 0점은 순위에 없음
    expect(card.recent[0]).toMatchObject({ ok: true });
    const badges = await badgesFor("k리그-덕후방", ["수원직관러", "대구"]);
    expect(badges["수원직관러"]).toBe("🎯3연속");
    expect(badges["대구"]).toBeUndefined();
    expect((await repo.listPredictions()).length).toBe(3);
  });

  it("notifies pickers once on first resolve, shows rate and 🏆 for last week's top (11/3)", async () => {
    const now = new Date("2026-11-03T03:00:00Z");
    const q = await repo.createPrediction({ room: "kbo-덕후방", title: "알림 테스트 승자는?", options: ["A", "B"], closesAt: "2026-11-03T09:00:00Z", seedKey: "kbo:notify" });
    await query("INSERT INTO push_subscriptions (endpoint, p256dh, auth, fingerprint) VALUES ('https://fcm.googleapis.com/fcm/send/x1', 'k', 'a', $1)", ["f".repeat(64)]);
    await repo.pickPrediction({ id: q.id, visitor: "n1", fp: "f".repeat(64), choice: 1 }, now);
    for (const v of ["n2", "n3", "n4", "n5"]) await repo.pickPrediction({ id: q.id, visitor: v, choice: 0 }, now);
    const sent: { title: string; url: string }[] = [];
    const send = async (_t: unknown, m: { title: string; url: string }) => { sent.push(m); return "sent" as const; };
    const r = await repo.resolvePrediction(q.id, 1, undefined, { send });
    expect(r.notified).toBe(1);
    expect(sent[0]!.title).toBe("🎯 맞혔어요! +10점");
    expect(sent[0]!.url).toContain("tab=predict");
    await repo.resolvePrediction(q.id, 1, undefined, { send }); // 다시 넣어도 또 안 보냄
    expect(sent.length).toBe(1);
    const card = await repo.predictCard("kbo-덕후방", "n1", null, new Date("2026-11-04T00:00:00Z"));
    expect(card.recent.find((x) => x.id === q.id)?.rate).toBe(20);
    // 🏆: 지난주(10/26~11/1) 1등
    const old = await repo.createPrediction({ room: "kbo-덕후방", title: "지난주 문제?", options: ["A", "B"], closesAt: "2026-10-29T09:00:00Z", seedKey: "kbo:lastweek" });
    await query("INSERT INTO prediction_picks (prediction_id, visitor_hash, nickname, nick_key, choice) VALUES ($1, 'w1', '지난주왕', '지난주왕', 0)", [old.id]);
    await query("UPDATE predictions SET answer = 0, resolved_at = '2026-10-29T12:00:00Z' WHERE id = $1", [old.id]);
    expect(await repo.lastWeekTop("kbo-덕후방", now)).toBe("지난주왕");
    expect(await repo.lastWeekTop("kbo-덕후방", new Date("2030-01-20T00:00:00Z"))).toBeNull();
  });

  it("gives a 📈 streak badge for KOSPI picks by nickname", async () => {
    await query("INSERT INTO kospi_closes (day, close) VALUES ('2026-10-26', 100), ('2026-10-27', 101), ('2026-10-28', 102), ('2026-10-29', 101.5)");
    for (const [day, side] of [["2026-10-27", 1], ["2026-10-28", 1], ["2026-10-29", -1]] as const)
      await query("INSERT INTO kospi_picks (day, visitor_hash, nickname, room, side) VALUES ($1, 'k1', '코스피 고수', '주식', $2)", [day, side]);
    const b = await badgesFor("주식", ["코스피고수"]);
    expect(b["코스피고수"]).toBe("📈3연속");
  });
});

describe("⚽ 내 팀 경기 찾기", async () => {
  const { kTeamIn, kTeamPlays } = await import("@/lib/peers");
  it("finds a team in free text and in match titles", () => {
    expect(kTeamIn("🚌 원정 직관러 / 광주FC")).toBe("광주");
    expect(kTeamIn("📣 직관 응원단 / 충북청주fc")).toBe("청주");
    expect(kTeamIn("원정 / 수원삼성")).toBe("수원삼성");
    expect(kTeamIn("수원FC 팬")).toBe("수원FC");
    expect(kTeamIn("그냥 축구 좋아요")).toBeUndefined();
    expect(kTeamPlays("K리그1 35R 11/07(토) 14:00 제주 vs 광주, 결과는?", "광주")).toBe(true);
    expect(kTeamPlays("K리그1 35R 11/08(일) 14:00 서울 vs 울산, 결과는?", "FC서울")).toBe(true);
    expect(kTeamPlays("K리그1 35R 11/08(일) 14:00 서울 vs 울산, 결과는?", "광주")).toBe(false);
    expect(kTeamPlays("수원FC vs 울산", "수원삼성")).toBe(false);
  });
});
