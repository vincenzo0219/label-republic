import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fanTestClickKey, isClickKey } from "@/lib/clicks";
import { roomGameLink, validScore } from "@/lib/miniGames";
import { aiPick, aiSkill, gaugeSweepMs, kickResult, kstWeekStart, outcomeFor, pkState, shooterOf, skillOf, teamKey } from "@/lib/pk";

/** A·B 가 킥마다 고른 칸을 [A, B] 쌍으로 */
const play = (pairs: [number, number][]) => pkState(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
const GOAL_A: [number, number] = [0, 1]; // A 차는 킥에서 A 0, B 1 → 골
const MISS: [number, number] = [0, 0];

describe("⚽ 승부차기 (규칙)", () => {
  it("한 번씩 번갈아: 짝수 킥은 A가 차고, 홀수 킥은 B가 찬다", () => {
    expect([0, 1, 2, 3].map(shooterOf)).toEqual(["a", "b", "a", "b"]);
    const s = play([GOAL_A, [2, 2], [1, 0]]);
    expect(s.kicks.map((k) => [k.shooter, k.goal])).toEqual([["a", true], ["b", false], ["a", true]]);
    expect([s.a, s.b, s.turn, s.done]).toEqual([2, 0, 3, false]);
  });
  it("둘 다 고른 킥만 센다 (상대가 아직이면 다음으로 안 넘어감)", () => {
    expect(pkState([0, 1], [1]).turn).toBe(1);
  });
  it("남은 킥으로 못 따라잡으면 그 자리에서 끝", () => {
    // A 3골, B 0골이고 B 남은 킥 2번 → 7킥 뒤 끝 (A 4번 찼고 B 3번 찼음)
    const s = play([GOAL_A, MISS, GOAL_A, MISS, GOAL_A, MISS, MISS]);
    expect(s.done).toBe(true);
    expect(s.winner).toBe("a");
    expect(outcomeFor(s, "b")).toBe("lose");
  });
  it("10킥 동점이면 서든데스, 한 쌍이 갈리면 끝", () => {
    const tie = Array.from({ length: 10 }, () => MISS);
    expect(play(tie).done).toBe(false);
    expect(play([...tie, GOAL_A, MISS])).toMatchObject({ done: true, winner: "a", a: 1, b: 0 });
    expect(play([...tie, GOAL_A]).done).toBe(false); // B 가 아직 안 참
  });
  it("서든데스 3쌍도 같으면 무승부", () => {
    const s = play(Array.from({ length: 16 }, () => MISS));
    expect([s.done, s.winner]).toEqual([true, "d"]);
    expect(outcomeFor(s, "a")).toBe("draw");
  });
  it("🤖 노방장 AI: 막을 때는 사람이 자주 찬 쪽, 찰 때는 덜 막은 쪽 (절반 확률), 지난 킥만 본다", () => {
    // 사람 = A. A 가 찬 킥(0, 2)에 모두 오른쪽(2), 막은 킥(1)에 왼쪽(0)
    const human = [2, 0, 2];
    const lean = () => 0.1; // 절반 안 → 기울어진 쪽
    expect(aiPick(human, 4, "a", lean)).toBe(2); // 4번 킥: A 슛 → AI 막기: 많이 찬 오른쪽
    expect(aiPick(human, 3, "a", lean)).not.toBe(0); // 3번 킥: AI 슛 → 사람이 막은 왼쪽(0)은 피한다
    expect(aiPick([], 0, "a", lean)).toBeGreaterThanOrEqual(0); // 기록 없으면 아무 칸
    let r = 0;
    const seq = [0.9, 0.99]; // 절반 밖 → 아무 칸 (0.99 → 오른쪽)
    expect(aiPick(human, 4, "a", () => seq[r++]!)).toBe(2);
  });
  it("게이지·반사신경: 정확도 25 미만은 빗나감, 방향 맞혀도 반사신경 40 미만은 손끝을 스치고 골", () => {
    expect(kickResult(0, 0, 24, 100)).toBe("miss");
    expect(kickResult(0, 1, 24, 0)).toBe("miss"); // 방향이 달라도 빗나가면 실패
    expect(kickResult(0, 1, 25, 100)).toBe("goal");
    expect(kickResult(2, 2, 90, 40)).toBe("save");
    expect(kickResult(2, 2, 90, 39)).toBe("graze");
    // 상태 계산에 반영: A 빗나감(0골), B 스침 골(1골)
    const s = pkState([0, 1], [1, 1], [10, 20], [50, 50]);
    expect(s.kicks.map((k) => [k.result, k.goal])).toEqual([["miss", false], ["graze", true]]);
    expect([s.a, s.b]).toEqual([0, 1]);
    // 실력 칸이 없으면 50 (예전 방식과 같다)
    expect(pkState([0], [0]).kicks[0]!.result).toBe("save");
  });
  it("실력 값: 0~1 실수만, 범위 밖은 자르고 없으면 50", () => {
    expect([skillOf(0.734), skillOf(-3), skillOf(7), skillOf(undefined), skillOf(Number.NaN), skillOf("1")]).toEqual([73, 0, 100, 50, 50, 50]);
  });
  it("게이지는 라운드마다 조금씩 빨라지고 너무 빠르지는 않다", () => {
    expect(gaugeSweepMs(0)).toBe(1100);
    expect(gaugeSweepMs(2)).toBeLessThan(gaugeSweepMs(0));
    expect(gaugeSweepMs(1)).toBe(gaugeSweepMs(0)); // 같은 라운드(A·B 한 번씩)는 같은 속도
    expect(gaugeSweepMs(40)).toBe(650);
  });
  it("🤖 노방장 AI 실력: 찰 때 약 8% 빗나감, 막을 때 반사신경 30~100 (방향 맞히면 약 86% 선방)", () => {
    expect(aiSkill(true, () => 0.05)).toBeLessThan(25);
    expect(aiSkill(true, () => 0.09)).toBeGreaterThanOrEqual(25);
    expect(aiSkill(true, () => 0.5)).toBeGreaterThanOrEqual(25);
    expect(aiSkill(false, () => 0)).toBe(30);
    expect(aiSkill(false, () => 0.999)).toBe(100);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const shots = Array.from({ length: 5000 }, () => aiSkill(true, rnd));
    const miss = shots.filter((x) => x < 25).length / shots.length;
    expect(miss).toBeGreaterThan(0.06);
    expect(miss).toBeLessThan(0.1);
    const keeps = Array.from({ length: 5000 }, () => aiSkill(false, rnd));
    const saves = keeps.filter((x) => x >= 40).length / keeps.length;
    expect(saves).toBeGreaterThan(0.82);
    expect(saves).toBeLessThan(0.9);
    expect(Math.min(...shots, ...keeps)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...shots, ...keeps)).toBeLessThanOrEqual(100);
  });
  it("타이밍 좋은 사람은 AI 를 절반보다 조금 더 이긴다 (모의 대결)", () => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let wins = 0;
    let losses = 0;
    for (let g = 0; g < 2000; g++) {
      const h: number[] = [];
      const ai: number[] = [];
      const hs: number[] = [];
      const as: number[] = [];
      for (let t = 0; t < 16; t++) {
        const humanShoots = shooterOf(t) === "a";
        ai.push(aiPick(h, t, "a", rnd));
        as.push(aiSkill(!humanShoots, rnd));
        h.push(Math.floor(rnd() * 3));
        hs.push(humanShoots ? 55 + Math.floor(rnd() * 46) : 30 + Math.floor(rnd() * 71)); // 잘 맞추지만 가끔 늦다
        const st = pkState(h, ai, hs, as);
        if (st.done) {
          if (st.winner === "a") wins++;
          else if (st.winner === "b") losses++;
          break;
        }
      }
    }
    const rate = wins / (wins + losses);
    expect(rate).toBeGreaterThan(0.52);
    expect(rate).toBeLessThan(0.68);
  });
  it("응원 팀 묶기: 띄어쓰기·대소문자·FC 무시", () => {
    expect(teamKey("FC서울")).toBe(teamKey(" 서울 fc "));
    expect(teamKey("전북 현대")).toBe("전북현대");
    expect(teamKey("")).toBe("");
  });
  it("이번 주 월요일 (KST)", () => {
    expect(kstWeekStart(new Date("2026-11-01T14:00:00Z"))).toBe("2026-10-26"); // 11/1(일) 23시 KST
    expect(kstWeekStart(new Date("2026-11-01T15:30:00Z"))).toBe("2026-11-02"); // 11/2(월) 00:30 KST
  });
  it("방 버튼·점수는 서버만 남긴다", () => {
    expect(roomGameLink("k리그-덕후방")).toEqual({ href: "/games/pk?from=room", label: "⚽ 승부차기 대결" });
    expect(validScore("pk", 3)).toBe(false);
  });
  it("버튼 클릭은 정해진 것만", () => {
    expect(isClickKey("fan-test", "kakao")).toBe(true);
    expect(isClickKey("fan-test", "pk")).toBe(true);
    expect(isClickKey("fan-test", "hack")).toBe(false);
    expect(isClickKey("home", "kakao")).toBe(false);
    expect(isClickKey("fan-test", "constructor")).toBe(false);
    const el = (attrs: Record<string, string>, text: string, inPoll = false) => ({
      closest: (sel: string) =>
        sel === ".debate-sides" ? (inPoll ? {} : null) : { getAttribute: (n: string) => attrs[n] ?? null, textContent: text },
    });
    expect(fanTestClickKey(el({}, "💬 카톡으로 매주 순위 받기") as never)).toBe("kakao");
    expect(fanTestClickKey(el({ href: "/rank/fan" }, "📊 결과 순위 →") as never)).toBe("rank");
    expect(fanTestClickKey(el({ "data-click": "pk" }, "⚽ 다른 팬과 승부차기 대결") as never)).toBe("pk");
    expect(fanTestClickKey(el({}, "머플러", true) as never)).toBe("poll");
    expect(fanTestClickKey(el({}, "아무 글") as never)).toBeNull();
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("⚽ 승부차기 (DB)", () => {
  process.env.DATABASE_URL = url;
  const dbp = import("@/lib/db");
  const pkp = import("@/lib/repo/pk");
  const clp = import("@/lib/repo/clicks");
  beforeAll(async () => {
    const { query } = await dbp;
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await (await dbp).pool().end();
  });

  it("짝 맞추기: 먼저 온 사람이 기다리고, 다음 사람이 붙는다 (자기 자신과는 X)", async () => {
    const pk = await pkp;
    const now = new Date("2026-11-03T03:00:00Z");
    const a = await pk.joinPk("va", "FC서울", now);
    expect(a).toMatchObject({ side: "a", status: "waiting" });
    const again = await pk.joinPk("va", "FC서울", new Date(now.getTime() + 1000));
    expect(again.status).toBe("waiting"); // 자기와는 짝이 안 된다 (예전 대기는 취소)
    const b = await pk.joinPk("vb", "전북", new Date(now.getTime() + 2000));
    expect(b).toEqual({ id: again.id, side: "b", status: "playing" });
    const v = await pk.pkView(b.id, "vb", new Date(now.getTime() + 2000));
    expect(v).toMatchObject({ kind: "live", myTeam: "전북", opTeam: "FC서울", turn: 0 });
    await expect(pk.pkView(b.id, "stranger")).rejects.toMatchObject({ status: 404 });
  });

  it("이번 킥 상대 칸은 둘 다 고르기 전까지 안 보이고, 결과는 서버가 정한다", async () => {
    const pk = await pkp;
    const now = new Date("2026-11-03T04:00:00Z");
    const { id } = await pk.joinPk("p1", "울산", now);
    await pk.joinPk("p2", "서울 FC", now);
    const t = (s: number) => new Date(now.getTime() + s * 1000);
    let v = await pk.pickPk(id, "p1", 0, 2, t(1));
    expect(v).toMatchObject({ myPicked: true, opPicked: false, kicks: [] });
    const p2 = await pk.pkView(id, "p2", t(1));
    expect(p2).toMatchObject({ opPicked: true, kicks: [] });
    expect(JSON.stringify(p2)).not.toContain('"shot"');
    // 같은 킥을 두 번 보내도 한 번만
    await pk.pickPk(id, "p1", 0, 0, t(1));
    v = await pk.pickPk(id, "p2", 0, 2, t(2), 0.9);
    expect(v.kicks).toEqual([{ turn: 0, shooter: "a", shot: 2, dive: 2, goal: false, result: "save" }]);
    // A 가 계속 골, B 는 계속 실패 → 7킥 뒤 끝
    const pairs: [number, number][] = [[0, 0], [0, 1], [1, 1], [0, 1], [2, 2], [0, 1]];
    let turn = 1;
    for (const [x, y] of pairs) {
      await pk.pickPk(id, "p1", turn, x, t(3 + turn));
      v = await pk.pickPk(id, "p2", turn, y, t(3 + turn));
      turn++;
    }
    expect(v).toMatchObject({ status: "done", outcome: "lose", me: 0, op: 3 });
    expect(v.record).toEqual({ wins: 0, losses: 1, draws: 0 });
    const a = await pk.pkView(id, "p1", t(20));
    expect(a).toMatchObject({ outcome: "win", record: { wins: 1, losses: 0, draws: 0 } });
    expect(a.teams).toEqual([{ team: "울산", wins: 1 }]);
    const { query } = await dbp;
    const plays = await query<{ n: number }>("SELECT count(*)::int AS n FROM game_plays WHERE game = 'pk'");
    expect(plays[0]!.n).toBe(2);
  });

  it("10초 동안 아무도 없으면 🤖 노방장 AI, AI 는 내 이번 칸을 안 보고 고른다", async () => {
    const pk = await pkp;
    const now = new Date("2026-11-04T04:00:00Z");
    const { id } = await pk.joinPk("solo", "전북 현대", now);
    const v = await pk.pkWithAi(id, "solo", new Date(now.getTime() + 10_000));
    expect(v).toMatchObject({ kind: "ai", status: "playing", opTeam: null });
    let cur = v;
    let turn = 0;
    while (cur.status === "playing" && turn < 20) {
      cur = await pk.pickPk(id, "solo", turn, turn % 3, new Date(now.getTime() + 11_000 + turn * 1000));
      expect(cur.kicks).toHaveLength(Math.min(turn + 1, cur.kicks.length));
      turn++;
    }
    expect(cur.status).toBe("done");
    expect(cur.outcome).not.toBeNull();
    // 늦게 온 사람은 이미 AI 와 붙은 대결에 끼지 않는다
    const late = await pk.joinPk("late", null, new Date(now.getTime() + 12_000));
    expect(late.status).toBe("waiting");
    expect(late.id).not.toBe(id);
  });

  it("실시간 상대가 15초 넘게 안 고르면 서버가 대신 골라 멈추지 않는다", async () => {
    const pk = await pkp;
    const now = new Date("2026-11-05T04:00:00Z");
    const { id } = await pk.joinPk("s1", null, now);
    await pk.joinPk("s2", null, now);
    await pk.pickPk(id, "s1", 0, 1, now);
    const v = await pk.pkView(id, "s1", new Date(now.getTime() + 16_000));
    expect(v.kicks).toHaveLength(1);
  });

  it("🏆 이번 주 팀별 승리: 같은 팀 이름은 묶고, 지난주는 빼고, 위 5팀", async () => {
    const pk = await pkp;
    const { query } = await dbp;
    await query("DELETE FROM pk_matches");
    const add = (team: string, at: string, winner = "a") =>
      query("INSERT INTO pk_matches (kind, status, a_visitor, a_team, winner, finished_at) VALUES ('ai', 'done', 'x', $1, $2, $3)", [team, winner, at]);
    await add("FC서울", "2026-11-03T03:00:00Z");
    await add("서울 FC", "2026-11-03T04:00:00Z");
    await add("FC서울", "2026-11-03T05:00:00Z");
    await add("전북", "2026-11-03T05:00:00Z");
    await add("전북", "2026-10-30T05:00:00Z"); // 지난주
    await add("울산", "2026-11-03T05:00:00Z", "b"); // 진 팀
    const top = await pk.pkTeamWins(new Date("2026-11-04T00:00:00Z"));
    expect(top).toEqual([{ team: "FC서울", wins: 3 }, { team: "전북", wins: 1 }]);
    const st = await pk.pkStats(7, new Date("2026-11-04T00:00:00Z"));
    expect(st.ai).toBeGreaterThanOrEqual(0);
  });

  it("버튼 클릭 세기와 비율용 본 수", async () => {
    const cl = await clp;
    const { query } = await dbp;
    const now = new Date("2026-11-03T03:00:00Z");
    await cl.recordClick("fan-test", "pk", "v1", now);
    await cl.recordClick("fan-test", "pk", "v1", now);
    await cl.recordClick("fan-test", "kakao", "v2", now);
    await query("INSERT INTO page_dwell (day, visitor_hash, path, ms, scroll_pct) VALUES ('2026-11-03', $1, '/fan-test', 1000, 100), ('2026-11-03', $2, '/fan-test', 1000, 50)", ["a".repeat(64), "b".repeat(64)]);
    const s = await cl.clickStats("fan-test", "/fan-test", 7, now);
    expect(s.viewers).toBe(2);
    expect(s.rows.find((r) => r.key === "pk")).toMatchObject({ clicks: 2, people: 1 });
    expect(s.rows.find((r) => r.key === "kakao")).toMatchObject({ clicks: 1, people: 1 });
    expect(s.rows.find((r) => r.key === "room")).toMatchObject({ clicks: 0 });
  });
});
