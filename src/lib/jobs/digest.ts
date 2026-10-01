import { pool } from "../db";
import { generateDigest, type DigestSource } from "../digest";
import { reportError } from "../error-tracking";

const DIGEST_LOCK_KEY = 4_823_004;
/** 같은 방 다이제스트를 다시 만들기까지 최소 간격 */
const REFRESH_HOURS = 20;

export type DigestBatchResult = { ran: boolean; generated: string[] };

/**
 * 지난 7일 [정보] 글이 있는 방마다, 최근 다이제스트가 REFRESH_HOURS 보다 오래됐으면 새로 만든다.
 * 블라인드·광고 의심·AI 큐레이터 글은 제외해 사람의 검증을 받은 글만 묶는다.
 */
export async function runDigestBatch(now = new Date()): Promise<DigestBatchResult> {
  const client = await pool().connect();
  try {
    const lock = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [DIGEST_LOCK_KEY]);
    if (!lock.rows[0]!.ok) return { ran: false, generated: [] };
    const run = await client.query<{ id: string }>("INSERT INTO digest_runs DEFAULT VALUES RETURNING id");
    const generated: string[] = [];
    try {
      const cats = await client.query<{ id: number; name: string; slug: string }>(
        `SELECT c.id, c.name, c.slug FROM categories c
          WHERE NOT EXISTS (SELECT 1 FROM board_digests d WHERE d.category_id = c.id
                              AND d.created_at > $1::timestamptz - make_interval(hours => $2))
          ORDER BY c.id`,
        [now.toISOString(), REFRESH_HOURS],
      );
      for (const c of cats.rows) {
        const posts = await client.query<DigestSource & { summary: string[] | null }>(
          `SELECT p.id, p.title, coalesce(s.summary_lines, ARRAY[]::text[]) AS summary, p.upvotes - p.downvotes AS net
             FROM posts p LEFT JOIN ai_summaries s ON s.id = p.ai_summary_id
            WHERE p.category_id = $1 AND p.post_type = 'info' AND NOT p.is_blinded AND NOT p.is_suppressed AND NOT p.is_ai_curated
              AND p.created_at > $2::timestamptz - interval '7 days' AND p.created_at <= $2::timestamptz
            ORDER BY p.trust_tier DESC, (p.upvotes - p.downvotes) DESC, p.created_at DESC
            LIMIT 8`,
          [c.id, now.toISOString()],
        );
        if (posts.rows.length === 0) continue;
        const digest = await generateDigest(c.name, posts.rows.map((p) => ({ ...p, summary: p.summary ?? [] })));
        await client.query(
          `INSERT INTO board_digests (category_id, period_start, period_end, headline, lines, post_ids, model_version)
           VALUES ($1, $2::timestamptz - interval '7 days', $2, $3, $4, $5, $6)`,
          [c.id, now.toISOString(), digest.headline, digest.lines, digest.postIds, digest.model],
        );
        generated.push(c.slug);
      }
      await client.query("DELETE FROM board_digests WHERE created_at < $1::timestamptz - interval '90 days'", [now.toISOString()]);
      await client.query("UPDATE digest_runs SET finished_at = now(), generated = $2 WHERE id = $1", [run.rows[0]!.id, generated.length]);
      await client.query("DELETE FROM digest_runs WHERE started_at < now() - interval '30 days'");
      return { ran: true, generated };
    } catch (err) {
      await client.query("UPDATE digest_runs SET finished_at = now(), error = $2 WHERE id = $1", [run.rows[0]!.id, String(err)]).catch(() => {});
      throw err;
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [DIGEST_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

export function startDigestScheduler(intervalMs: number): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runDigestBatch();
      if (r.generated.length) console.log(`[digest] generated: ${r.generated.join(", ")}`);
    } catch (err) {
      console.error("[digest] batch failed:", (err as Error).message);
      reportError(err, { kind: "job", where: "digest" });
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
