import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, expect, it, describe } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("📊 퀴즈 리텐션 (DB)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { quizRetention } = await import("@/lib/repo/quizRetention");
  beforeAll(async () => {
    await query("DROP SCHEMA public CASCADE");
    await query("CREATE SCHEMA public");
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await query(readFileSync(path.join(dir, f), "utf8"));
  });
  afterAll(async () => {
    await pool().end();
  });

  const view = (room: string, day: string, v: string) =>
    query("INSERT INTO page_views (day, visitor_hash, is_returning, path, category_slug, source, is_landing) VALUES ($1, $2, false, '/c/x', $3, 'direct', true)", [day, v, room]);
  const answer = (room: string, day: string, v: string) => query("INSERT INTO quiz_answers (room, day, visitor_hash, choice) VALUES ($1, $2, $3, 0)", [room, day, v]);

  it("참여율·다음 날 재방문(오늘은 -)·7일 중 3일 이상·전체 줄", async () => {
    const now = new Date("2026-11-04T03:00:00Z"); // 한국 11/4 낮
    // 11/1: 방문 4명, a·b 답 → 11/2 에 a 만 다시 옴 (조회만)
    for (const v of ["a", "b", "c", "e"]) await view("커피-덕후방", "2026-11-01", v);
    await answer("커피-덕후방", "2026-11-01", "a");
    await answer("커피-덕후방", "2026-11-01", "b");
    await view("커피-덕후방", "2026-11-02", "a");
    // a 는 11/3·11/4 에도 답 → 3일 이상
    await answer("커피-덕후방", "2026-11-03", "a");
    await answer("커피-덕후방", "2026-11-04", "a");
    // 다른 방에서 다음 날 온 건 안 센다
    await answer("캠핑-덕후방", "2026-11-03", "b");
    await view("커피-덕후방", "2026-11-04", "b");
    // 📈 코스피 맞히기도 답으로 센다 (고른 한국 날짜)
    await query("INSERT INTO kospi_picks (day, visitor_hash, room, side, created_at) VALUES ('2026-11-04', 'k', '주식', 1, '2026-11-03T05:00:00Z')");
    await view("주식", "2026-11-04", "k");

    const r = await quizRetention(7, now);
    expect(r).toMatchObject({ from: "2026-10-29", to: "2026-11-04" });
    const coffee = r.rooms.find((x) => x.room === "커피-덕후방")!;
    expect(coffee.test).toBe(true);
    expect(coffee.days.find((x) => x.day === "2026-11-01")).toMatchObject({ visitors: 4, answerers: 2, rate: 50, returned: 1, nextDay: 50 });
    expect(coffee.days.find((x) => x.day === "2026-11-04")!.nextDay).toBeNull();
    expect(coffee).toMatchObject({ answerers: 2, regulars: 1, regularRate: 50 });
    // 11/1 (1/2) + 11/3 (1/1, 11/4 에 답으로 다시 옴) → 2/3
    expect(coffee.nextDay).toBe(67);
    const camp = r.rooms.find((x) => x.room === "캠핑-덕후방")!;
    expect(camp.test).toBe(false);
    expect(camp.days[0]).toMatchObject({ day: "2026-11-03", returned: 0, nextDay: 0 });
    const stock = r.rooms.find((x) => x.room === "주식")!;
    expect(stock.days[0]).toMatchObject({ day: "2026-11-03", answerers: 1, returned: 1, nextDay: 100 });
    // 테스트 방이 먼저
    expect(r.rooms[r.rooms.length - 1]!.room).toBe("캠핑-덕후방");
    // 전체: 방·사람 짝 합계
    expect(r.total.days.find((x) => x.day === "2026-11-03")).toMatchObject({ answerers: 3, returned: 2, nextDay: 67 });
    expect(r.total).toMatchObject({ answerers: 4, regulars: 1 });
  });
});
