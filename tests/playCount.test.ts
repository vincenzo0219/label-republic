import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, expect, it, describe } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

// 🧩 놀이 탭 숫자 (11/2): 오늘 참여한 사람만, 한 사람은 한 번
d("놀이 탭 오늘 참여 수 (database)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { playCountToday } = await import("@/lib/repo/playCount");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });
  it("counts distinct visitors who played today in this room only", async () => {
    const room = "읽는-책-제목을-교환해-보자";
    const now = new Date();
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
    expect(await playCountToday(room, now)).toBe(0);
    await query("INSERT INTO room_picks (board, period, visitor_hash, choice) VALUES ('sentence-pick', $1, 'a', '0'), ('sentence-pick', $1, 'b', '1')", [day]);
    await query("INSERT INTO quiz_answers (room, day, visitor_hash, choice) VALUES ($1, $2, 'a', 0), ($1, $2, 'c', 1)", [room, day]);
    await query("INSERT INTO quiz_answers (room, day, visitor_hash, choice) VALUES ('커피-덕후방', $1, 'z', 0)", [day]);
    await query("INSERT INTO quiz_answers (room, day, visitor_hash, choice) VALUES ($1, '2020-01-01', 'old', 0)", [room]);
    expect(await playCountToday(room, now)).toBe(3);
    expect(await playCountToday("커피-덕후방", now)).toBe(1);
  });
});
