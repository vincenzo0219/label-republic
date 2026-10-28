import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SIM_HIGH, SIM_SCENES, scoreSim, simTypeOf } from "@/lib/someSim";

// 💬 썸 시뮬레이터 (10/28): 불안·회피 두 축 → 4유형
describe("썸 시뮬레이터 점수", () => {
  it("8장면, 장면마다 보기 4개, 점수는 0~2", () => {
    expect(SIM_SCENES).toHaveLength(8);
    for (const s of SIM_SCENES) {
      expect(s.choices).toHaveLength(4);
      for (const c of s.choices) expect([c.anx, c.avo].every((v) => v >= 0 && v <= 2)).toBe(true);
      // 장면마다 두 축 모두 0인 보기(안정)가 하나는 있다
      expect(s.choices.some((c) => c.anx === 0 && c.avo === 0)).toBe(true);
    }
  });
  it("두 축의 높고 낮음으로 4유형", () => {
    expect(simTypeOf(0, 0)).toBe("sunny");
    expect(simTypeOf(SIM_HIGH, 0)).toBe("shower");
    expect(simTypeOf(0, SIM_HIGH)).toBe("fog");
    expect(simTypeOf(SIM_HIGH, SIM_HIGH)).toBe("storm");
  });
  it("모든 유형이 실제로 나올 수 있고, 잘못된 입력은 거절", () => {
    const best = (f: (c: { anx: number; avo: number }) => number) => SIM_SCENES.map((s) => s.choices.reduce((bi, c, i, a) => (f(c) > f(a[bi]!) ? i : bi), 0));
    expect(scoreSim(SIM_SCENES.map(() => 0))!.type).toBe("sunny");
    expect(scoreSim(best((c) => c.anx * 3 - c.avo))!.type).toBe("shower");
    expect(scoreSim(best((c) => c.avo * 3 - c.anx))!.type).toBe("fog");
    expect(scoreSim(best((c) => c.anx + c.avo))!.type).toBe("storm");
    expect(scoreSim([0, 1])).toBeNull();
    expect(scoreSim(SIM_SCENES.map(() => 4))).toBeNull();
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("썸 시뮬레이터 (DB)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const repo = await import("@/lib/repo/someSim");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  }, 120_000);
  afterAll(async () => {
    await pool().end();
  });
  it("분포는 방문자마다 첫 결과만", async () => {
    await repo.saveSimResult("a", { type: "fog", anx: 2, avo: 9 });
    await repo.saveSimResult("a", { type: "sunny", anx: 0, avo: 0 });
    await repo.saveSimResult("b", { type: "shower", anx: 9, avo: 1 });
    expect(await repo.simStats()).toEqual({ participants: 2, share: { sunny: 0, shower: 50, fog: 50, storm: 0 } });
  });
});
