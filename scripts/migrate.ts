/**
 * 초간단 마이그레이션 러너: db/migrations/*.sql 을 파일명 순서로 1회씩 적용한다.
 * 적용 이력은 schema_migrations 테이블에 기록된다.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
    );
    const dir = path.join(process.cwd(), "db", "migrations");
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    const { rows } = await client.query<{ name: string }>("SELECT name FROM schema_migrations");
    const applied = new Set(rows.map((r) => r.name));

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(path.join(dir, file), "utf8");
      const started = Date.now();
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        // 걸린 시간 — 업데이트 중에는 앱이 멈춰 있으므로 배포 시간 추정에 쓴다 (Sprint 34 리허설)
        console.log(`applied ${file} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`migration ${file} failed: ${(err as Error).message}`);
      }
    }
    console.log("migrations up to date");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
