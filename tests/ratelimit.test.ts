import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
d("shared rate limiting (postgres backend)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const rl = await import("@/lib/rate-limit");

  beforeAll(async () => {
    process.env.RATE_LIMIT_BACKEND = "postgres";
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      await query(readFileSync(path.join(dir, f), "utf8"));
    }
  });
  beforeEach(async () => {
    await rl.resetRateLimits();
  });
  afterAll(async () => {
    delete process.env.RATE_LIMIT_BACKEND;
    await pool().end();
  });

  it("enforces the limit through the database so every instance shares it", async () => {
    const t = 10_000_000; // 창의 시작점
    expect(await rl.hit("pin:x", 3, 60_000, t)).toBe(true);
    expect(await rl.hit("pin:x", 3, 60_000, t + 1)).toBe(true);
    expect(await rl.hit("pin:x", 3, 60_000, t + 2)).toBe(true);
    expect(await rl.hit("pin:x", 3, 60_000, t + 3)).toBe(false);
    expect(await rl.isLimited("pin:x", 3, 60_000, t + 4)).toBe(true);
    expect(await rl.hit("pin:other", 3, 60_000, t + 5)).toBe(true); // 키별 독립
    const [row] = await query<{ count: number }>("SELECT count FROM rate_limits WHERE key = 'pin:x'");
    expect(row!.count).toBe(3); // 거부된 요청은 기록하지 않음
  });

  it("slides across window boundaries instead of resetting all at once", async () => {
    const w = 60_000;
    const start = 20_000 * w; // 창 경계에 정렬
    for (let i = 0; i < 4; i++) expect(await rl.hit("s", 4, w, start + w - 1000 + i)).toBe(true);
    // 새 창이 막 시작된 시점: 직전 창 4건이 거의 그대로 반영돼 여전히 막힘 (고정 창이면 여기서 풀려 2배 버스트)
    expect(await rl.hit("s", 4, w, start + w + 10)).toBe(false);
    // 창 절반이 지나면 직전 창 가중치가 절반(2건)으로 줄어 다시 허용
    expect(await rl.hit("s", 4, w, start + w + w / 2)).toBe(true);
  });

  it("prunes expired buckets", async () => {
    await query("INSERT INTO rate_limits (key, bucket, count, expires_at) VALUES ('old', 1, 5, now() - interval '1 minute')");
    await rl.hit("fresh", 5, 60_000);
    expect(await rl.pruneRateLimits()).toBe(1);
    expect((await query<{ key: string }>("SELECT key FROM rate_limits")).map((r) => r.key)).toEqual(["fresh"]);
  });
});
