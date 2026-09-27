/**
 * 신뢰도 배지 배치 재계산 — cron 등으로 주기 실행 (예: 10분마다).
 * 투표가 없어도 "게시 24시간 경과"로 검증 대기가 풀리는 글을 반영하기 위해 필요하다.
 */
import { Client } from "pg";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: number; name: string }>("SELECT id, name FROM categories ORDER BY id");
    for (const c of rows) {
      const res = await client.query<{ changed: number }>("SELECT refresh_trust_tiers($1) AS changed", [c.id]);
      console.log(`${c.name}: ${res.rows[0]!.changed} posts updated`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
