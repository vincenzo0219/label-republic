import { pool } from "../db";
import { config } from "../config";
import { curatorIntervalHours, publishSeed } from "../curator";

const CURATOR_LOCK_KEY = 4_823_002;

type CategoryState = { id: number; slug: string; human: number; ai: number; last_ai_at: string | null };
export type CuratorCategoryResult = { slug: string; human: number; ai: number; intervalHours: number | null; published: string | null; reason: string };
export type CuratorBatchResult = { ran: boolean; published: number; categories: CuratorCategoryResult[] };

/**
 * 오픈 후 "활성화 유지": 카테고리별로 물러남 정책(curatorIntervalHours)을 계산해
 * 게시 간격이 지났으면 대기열(curator_queue)에서 한 건을 게시한다.
 * CURATOR_ACTIVE_UNTIL 이 지나면 아무것도 게시하지 않는다.
 */
export async function runCuratorBatch(now = new Date()): Promise<CuratorBatchResult> {
  const until = config.curatorActiveUntil;
  const client = await pool().connect();
  try {
    const lock = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [CURATOR_LOCK_KEY]);
    if (!lock.rows[0]!.ok) return { ran: false, published: 0, categories: [] };
    const run = await client.query<{ id: string }>("INSERT INTO curator_runs DEFAULT VALUES RETURNING id");
    const runId = run.rows[0]!.id;
    const results: CuratorCategoryResult[] = [];
    try {
      const states = await client.query<CategoryState>(
        `SELECT c.id, c.slug,
                count(p.id) FILTER (WHERE NOT p.is_ai_curated)::int AS human,
                count(p.id) FILTER (WHERE p.is_ai_curated)::int     AS ai,
                (SELECT max(created_at) FROM posts x WHERE x.category_id = c.id AND x.is_ai_curated) AS last_ai_at
           FROM categories c
           LEFT JOIN posts p ON p.category_id = c.id AND p.created_at > $1::timestamptz - interval '7 days'
          GROUP BY c.id ORDER BY c.id`,
        [now.toISOString()],
      );
      for (const s of states.rows) {
        const intervalHours = curatorIntervalHours({ humanPosts7d: s.human, aiPosts7d: s.ai });
        const base = { slug: s.slug, human: s.human, ai: s.ai, intervalHours, published: null as string | null };
        if (until && now > until) {
          results.push({ ...base, reason: "active period ended" });
          continue;
        }
        if (intervalHours === null) {
          results.push({ ...base, reason: "retreated: enough human posts" });
          continue;
        }
        if (s.last_ai_at && now.getTime() - new Date(s.last_ai_at).getTime() < intervalHours * 3600_000) {
          results.push({ ...base, reason: "not due" });
          continue;
        }
        await client.query("BEGIN");
        try {
          const next = await client.query<{ id: string; seed_key: string; title: string; body: string; summary_lines: [string, string, string]; comments: string[] }>(
            `SELECT id, seed_key, title, body, summary_lines, comments FROM curator_queue
              WHERE category_id = $1 AND status = 'queued' ORDER BY priority, id LIMIT 1 FOR UPDATE SKIP LOCKED`,
            [s.id],
          );
          const item = next.rows[0];
          if (!item) {
            await client.query("ROLLBACK");
            results.push({ ...base, reason: "queue empty" });
            continue;
          }
          const postId = await publishSeed(client, s.id, {
            key: item.seed_key,
            title: item.title,
            body: item.body,
            summary: item.summary_lines,
            comments: item.comments,
          });
          await client.query(
            `UPDATE curator_queue SET status = $2, published_post_id = $3, published_at = now() WHERE id = $1`,
            [item.id, postId ? "published" : "skipped", postId],
          );
          await client.query("COMMIT");
          results.push({ ...base, published: postId, reason: postId ? "published" : "duplicate seed key" });
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        }
      }
      const published = results.filter((r) => r.published).length;
      await client.query("UPDATE curator_runs SET finished_at = now(), published = $2, detail = $3 WHERE id = $1", [
        runId,
        published,
        JSON.stringify(results),
      ]);
      await client.query("DELETE FROM curator_runs WHERE started_at < now() - interval '30 days'");
      return { ran: true, published, categories: results };
    } catch (err) {
      await client
        .query("UPDATE curator_runs SET finished_at = now(), error = $2 WHERE id = $1", [runId, String(err)])
        .catch(() => {});
      throw err;
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [CURATOR_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

export function startCuratorScheduler(intervalMs: number): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runCuratorBatch();
      if (r.published > 0) {
        const slugs = r.categories.filter((c) => c.published).map((c) => c.slug);
        console.log(`[curator] published ${r.published} post(s): ${slugs.join(", ")}`);
      }
    } catch (err) {
      console.error("[curator] batch failed:", (err as Error).message);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
