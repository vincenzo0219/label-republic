/**
 * ANTHROPIC_API_KEY가 없던 시기에 추출 요약(extractive-v1)으로 저장된 글의 요약을 Claude 요약으로 다시 만든다.
 * 작성자가 직접 쓰거나 수정한 요약은 건드리지 않는다.
 *
 *   npm run summary:backfill -- --limit 50 [--dry-run]
 */
import { pool, query, tx } from "../src/lib/db";
import { config } from "../src/lib/config";
import { EXTRACTIVE_MODEL, generateSummary } from "../src/lib/summary";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (!config.anthropicApiKey) throw new Error("ANTHROPIC_API_KEY is not set — nothing to backfill with");
  const limit = Math.min(Number(arg("limit") ?? 50) || 50, 1000);
  const dryRun = process.argv.includes("--dry-run");

  const rows = await query<{ id: string; title: string; body: string }>(
    `SELECT p.id, p.title, p.body
       FROM posts p JOIN ai_summaries s ON s.id = p.ai_summary_id
      WHERE s.model_version = $1 AND NOT s.is_author_edited AND NOT p.is_blinded
      ORDER BY p.id DESC LIMIT $2`,
    [EXTRACTIVE_MODEL, limit],
  );
  console.log(`${rows.length} posts to backfill${dryRun ? " (dry run)" : ""}`);

  let done = 0;
  for (const post of rows) {
    const s = await generateSummary(post.title, post.body);
    if (s.model === EXTRACTIVE_MODEL) {
      console.warn(`post ${post.id}: Claude unavailable, stopping`);
      break;
    }
    if (!dryRun) {
      await tx(async (client) => {
        const ins = await client.query<{ id: string }>(
          `INSERT INTO ai_summaries (post_id, summary_lines, model_version, is_author_edited) VALUES ($1, $2, $3, false) RETURNING id`,
          [post.id, s.lines, s.model],
        );
        await client.query("UPDATE posts SET ai_summary_id = $1 WHERE id = $2", [ins.rows[0]!.id, post.id]);
      });
    }
    done++;
    console.log(`post ${post.id}: ${s.lines.join(" / ")}`);
  }
  console.log(`backfilled ${done}/${rows.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool().end());
