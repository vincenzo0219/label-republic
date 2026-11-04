import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ANI_PER_DAY, ANI_TITLES, aniDailyIndexes, aniDailyQuestions, aniEncode, answerHash, chosung, gradeAni, normalizeAnswer } from "@/lib/aniChosung";
import {
  beatenPushDue,
  dailyPushDue,
  deltaText,
  deltaVsYesterday,
  MIN_TEAM,
  primaryValue,
  streakBadgeText,
  streakOf,
  teamTable,
  validTeam,
} from "@/lib/dailyGames";
import { isPair, K_CLUBS, KMATCH_PER_DAY, kmatchBoard, kmatchScore } from "@/lib/kMatch";
import { K_LEAGUE_TEAMS } from "@/lib/peers";
import { roomGameLink } from "@/lib/miniGames";

describe("🔥 연속 기록 (KST 날짜)", () => {
  it("오늘 했으면 오늘까지, 안 했으면 어제까지", () => {
    expect(streakOf(["2026-11-02", "2026-11-03", "2026-11-04"], "2026-11-04")).toBe(3);
    expect(streakOf(["2026-11-02", "2026-11-03"], "2026-11-04")).toBe(2);
    expect(streakOf(["2026-11-01", "2026-11-03"], "2026-11-04")).toBe(1);
    expect(streakOf(["2026-11-01"], "2026-11-04")).toBe(0);
    expect(streakOf([], "2026-11-04")).toBe(0);
  });
  it("달·해가 바뀌어도 이어진다", () => {
    expect(streakOf(["2026-10-30", "2026-10-31", "2026-11-01"], "2026-11-01")).toBe(3);
    expect(streakOf(["2026-12-31", "2027-01-01"], "2027-01-01")).toBe(2);
  });
  it("배지는 2일 연속부터", () => {
    expect(streakBadgeText(1)).toBeUndefined();
    expect(streakBadgeText(2)).toBe("🔥2일");
  });
});

describe("⚔️ 편 대결", () => {
  it(`${MIN_TEAM}명 미만인 편은 빼고, 좋은 편 먼저`, () => {
    const t = teamTable("anichosung", [
      { team: "열혈", best: aniEncode(10, 50_000) },
      { team: "열혈", best: aniEncode(8, 50_000) },
      { team: "열혈", best: aniEncode(6, 50_000) },
      { team: "일상", best: aniEncode(12, 50_000) },
      { team: "일상", best: aniEncode(12, 50_000) },
    ]);
    expect(t).toEqual([{ team: "열혈", members: 3, avg: 8 }]);
  });
  it("K리그는 시간이 짧은 편이 위", () => {
    const people = ["전북", "전북", "전북", "울산", "울산", "울산"].map((team, i) => ({ team, best: [20_000, 22_000, 24_000, 10_000, 12_000, 14_000][i]! }));
    expect(teamTable("kmatch", people).map((r) => r.team)).toEqual(["울산", "전북"]);
  });
  it("고를 수 있는 편만", () => {
    expect(validTeam("anichosung", "판타지")).toBe(true);
    expect(validTeam("anichosung", "공포")).toBe(false);
    expect(validTeam("kmatch", "FC서울")).toBe(true);
    expect(validTeam("booksent", "🌧️ 서정파")).toBe(true);
  });
});

describe("어제의 나", () => {
  it("책·애니는 개수, K리그는 줄어든 초", () => {
    expect(deltaVsYesterday("anichosung", aniEncode(9, 40_000), aniEncode(7, 40_000))).toBe(2);
    expect(deltaVsYesterday("kmatch", 18_000, 21_500)).toBe(3.5);
    expect(deltaVsYesterday("kmatch", 18_000, null)).toBeNull();
    expect(deltaText("anichosung", 2)).toBe("어제의 나보다 +2개");
    expect(deltaText("kmatch", 3.5)).toBe("어제의 나보다 3.5초 빨라요");
    expect(primaryValue("booksent", 80_123)).toBe(8);
  });
});

describe("🔔 알림 하루 한 번", () => {
  it("오늘 문제: 정한 시각부터 밤 10시 전, 오늘 안 보냈고 아직 안 했을 때만", () => {
    expect(dailyPushDue("booksent", "20:59", "2026-11-04", null, false)).toBe(false);
    expect(dailyPushDue("booksent", "21:00", "2026-11-04", null, false)).toBe(true);
    expect(dailyPushDue("booksent", "21:00", "2026-11-04", "2026-11-04", false)).toBe(false);
    expect(dailyPushDue("booksent", "21:00", "2026-11-04", "2026-11-03", true)).toBe(false);
    expect(dailyPushDue("kmatch", "20:00", "2026-11-04", "2026-11-03", false)).toBe(true);
    expect(dailyPushDue("anichosung", "22:00", "2026-11-04", null, false)).toBe(false);
  });
  it("기록 깨짐: 하루 한 번, 밤·새벽은 보내지 않는다", () => {
    expect(beatenPushDue("12:00", "2026-11-04", null)).toBe(true);
    expect(beatenPushDue("12:00", "2026-11-04", "2026-11-04")).toBe(false);
    expect(beatenPushDue("23:10", "2026-11-04", null)).toBe(false);
    expect(beatenPushDue("07:59", "2026-11-04", null)).toBe(false);
  });
});

describe("🎨 애니 제목 초성", () => {
  it("제목 150개 이상, 겹침 없음", () => {
    expect(ANI_TITLES.length).toBeGreaterThanOrEqual(150);
    const n = ANI_TITLES.map((t) => normalizeAnswer(t[0]!));
    expect(new Set(n).size).toBe(n.length);
  });
  it("초성: 한글만 바꾸고 숫자·영문·띄어쓰기는 그대로", () => {
    expect(chosung("진격의 거인")).toBe("ㅈㄱㅇ ㄱㅇ");
    expect(chosung("은하철도 999")).toBe("ㅇㅎㅊㄷ 999");
  });
  it("하루 문제는 날짜마다 같고, 날이 바뀌면 다르다", () => {
    expect(aniDailyIndexes("2026-11-05")).toEqual(aniDailyIndexes("2026-11-05"));
    expect(aniDailyIndexes("2026-11-05")).not.toEqual(aniDailyIndexes("2026-11-06"));
    expect(new Set(aniDailyIndexes("2026-11-05")).size).toBe(ANI_PER_DAY);
  });
  it("정답 지문이 맞고, 띄어쓰기·대소문자는 안 본다", () => {
    const q = aniDailyQuestions("2026-11-05")[0]!;
    const title = ANI_TITLES[aniDailyIndexes("2026-11-05")[0]!]![0]!;
    expect(q.hashes).toContain(answerHash(title.replace(/\s/g, "")));
    expect(JSON.stringify(q)).not.toContain(title);
  });
  it("채점: 순서대로, 다른 표기도 받는다", () => {
    const day = "2026-11-05";
    const idx = aniDailyIndexes(day);
    const answers = [ANI_TITLES[idx[0]!]!.at(-1)!, "", "틀린답"];
    const g = gradeAni(day, answers);
    expect(g.correct).toBe(1);
    expect(g.results.map((r) => r.ok)).toEqual([true, false, false]);
  });
});

describe("🏟️ K리그 구단·홈구장", () => {
  it("12개 구단, 응원 팀 이름은 기존 K리그 팀 목록과 같다", () => {
    expect(K_CLUBS).toHaveLength(12);
    for (const c of K_CLUBS) expect(K_LEAGUE_TEAMS).toContain(c.team);
    expect(new Set(K_CLUBS.map((c) => c.stadium)).size).toBe(12);
  });
  it("하루 판은 날짜마다 같고, 구단마다 홈구장이 하나씩 있다", () => {
    const b = kmatchBoard("2026-11-05");
    expect(b).toEqual(kmatchBoard("2026-11-05"));
    expect(b.clubs).toHaveLength(KMATCH_PER_DAY);
    for (const c of b.clubs) expect(b.stadiums.some((s) => isPair(c, s))).toBe(true);
  });
  it("점수 = 걸린 시간 + 틀린 수 × 3초", () => {
    expect(kmatchScore(12_000, 2)).toBe(18_000);
    expect(kmatchScore(100, 0)).toBe(1500);
  });
  it("방 맨 위 바로가기는 하루 게임", () => {
    expect(roomGameLink("k리그-덕후방")?.href).toBe("/games/kmatch?from=room");
    expect(roomGameLink("애니-만화-덕후방")?.href).toBe("/games/anichosung?from=room");
    expect(roomGameLink("게임-덕후방")?.href).toBe("/games/reaction?from=room");
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("🎯 하루 게임 (DB)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const r = await import("@/lib/repo/dailyGames");
  const b = await import("@/lib/repo/badges");
  const job = await import("@/lib/jobs/dailyGamePush");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  const at = (day: string, hm = "12:00") => new Date(`${day}T${hm}:00+09:00`);

  it("하루 첫 판만 랭킹, 연속·어제의 나·오늘 순위", async () => {
    expect(await r.insertDailyPlay("anichosung", "v1", aniEncode(5, 40_000), "애니왕", at("2026-11-03"))).toBe(true);
    expect(await r.insertDailyPlay("anichosung", "v1", aniEncode(7, 40_000), "애니왕", at("2026-11-04"))).toBe(true);
    expect(await r.insertDailyPlay("anichosung", "v1", aniEncode(9, 40_000), "애니왕", at("2026-11-04", "13:00"))).toBe(false);
    await r.insertDailyPlay("anichosung", "v2", aniEncode(8, 40_000), null, at("2026-11-04"));
    const s = await r.dailyStatus("anichosung", "v1", at("2026-11-04", "14:00"));
    expect(s.streak).toBe(2);
    expect(s.today).toEqual({ score: aniEncode(7, 40_000), rank: 2, total: 2, top: 100 });
    expect(s.delta).toBe(2);
    expect(s.lowPop).toBe(true);
    // 다음 날 아직 안 했으면 어제까지 연속
    expect((await r.dailyStatus("anichosung", "v1", at("2026-11-05", "09:00"))).streak).toBe(2);
  });

  it("🔥 배지: 이 방 하루 게임 연속 2일 이상인 닉네임", async () => {
    const badges = await b.badgesFor("애니-만화-덕후방", ["애니왕"]);
    expect(badges["애니왕"] ?? "").toContain("🔥");
  });

  it("편: 3명 이상인 편만 평균, 잘못된 편은 못 고른다", async () => {
    const day = "2026-11-04";
    for (const [v, team, n] of [["t1", "열혈", 6], ["t2", "열혈", 8], ["t3", "열혈", 10], ["t4", "일상", 9]] as const) {
      await r.insertDailyPlay("anichosung", v, aniEncode(n, 30_000), null, at(day));
      await r.setDailyTeam("anichosung", v, team);
    }
    const teams = await r.weekTeams("anichosung", at(day, "15:00"));
    expect(teams).toEqual([{ team: "열혈", members: 3, avg: 8 }]);
    await expect(r.setDailyTeam("anichosung", "t1", "공포")).rejects.toThrow();
    await expect(r.setDailyTeam("booksent", "t1", "🌧️ 서정파")).rejects.toThrow();
  });

  it("🔔 알림: 오늘 문제는 시각이 되면 하루 한 번, 기록이 깨지면 하루 한 번", async () => {
    await query("INSERT INTO push_subscriptions (id, endpoint, p256dh, auth) VALUES (901, 'https://fcm.googleapis.com/x1', 'k', 'a'), (902, 'https://fcm.googleapis.com/x2', 'k', 'a')");
    await query("INSERT INTO game_push_subs (subscription_id, game, visitor_hash) VALUES (901, 'kmatch', 'k1'), (902, 'kmatch', 'k2')");
    const sent: string[] = [];
    const send = async (s: { endpoint: string }, m: { tag: string }) => {
      sent.push(`${s.endpoint.slice(-2)}:${m.tag.split("-")[0]}`);
      return "sent" as const;
    };
    const day = "2026-11-06";
    // k1 이 오전에 한 판, k2 가 나중에 더 빠른 기록
    await r.insertDailyPlay("kmatch", "k1", 20_000, null, at(day, "10:00"));
    await r.insertDailyPlay("kmatch", "k2", 15_000, null, at(day, "11:00"));
    await job.runDailyGamePush(at(day, "12:00"), { send });
    expect(sent).toEqual(["x1:beaten"]);
    await job.runDailyGamePush(at(day, "13:00"), { send });
    expect(sent).toEqual(["x1:beaten"]); // 하루 한 번
    // 다음 날 20시: 둘 다 아직 안 했으니 오늘 문제 알림 한 번씩
    await job.runDailyGamePush(at("2026-11-07", "20:01"), { send });
    await job.runDailyGamePush(at("2026-11-07", "20:30"), { send });
    expect(sent.filter((x) => x.endsWith(":daily")).sort()).toEqual(["x1:daily", "x2:daily"]);
  });

  it("관리자 재방문표가 게임마다 한 줄", async () => {
    const rows = await r.dailyRetention(14, at("2026-11-07"));
    expect(rows.map((x) => x.game)).toEqual(["booksent", "anichosung", "kmatch"]);
    expect(rows.find((x) => x.game === "kmatch")!.pushOn).toBe(2);
  });
});
