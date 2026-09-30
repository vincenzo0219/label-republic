import { afterAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("database restarts (Sprint 24 rehearsal)", async () => {
  process.env.DATABASE_URL = url;
  const { pool, query } = await import("@/lib/db");
  const { Client } = await import("pg");
  afterAll(async () => {
    await pool().end();
  });

  it("survives the server terminating idle pooled connections and reconnects on the next query", async () => {
    const uncaught: unknown[] = [];
    const onUncaught = (e: unknown) => uncaught.push(e);
    process.on("uncaughtException", onUncaught);
    try {
      await query("SELECT 1");
      const [{ pid }] = await query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
      expect(pool().idleCount).toBeGreaterThan(0);
      // DB 재시작·장애 조치 때처럼 서버 쪽에서 쉬고 있는 연결을 끊는다
      const admin = new Client({ connectionString: url });
      await admin.connect();
      await admin.query("SELECT pg_terminate_backend($1)", [pid]);
      await admin.end();
      await new Promise((r) => setTimeout(r, 300));
      expect(uncaught).toEqual([]);
      // 다음 요청은 새 연결로 정상 처리
      expect(await query<{ ok: number }>("SELECT 1 AS ok")).toEqual([{ ok: 1 }]);
    } finally {
      process.off("uncaughtException", onUncaught);
    }
  });
});
