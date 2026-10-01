import { pool } from "../db";
import { config } from "../config";
import { curatorIntervalHours, publishSeed } from "../curator";
import { curatorSafetyProblems, generateWithClaude, type CuratorGenerator } from "../curator-ai";
import { reportError } from "../error-tracking";

const CURATOR_LOCK_KEY = 4_823_002;

type CategoryState = { id: number; slug: string; name: string; description: string; human: number; ai: number; last_ai_at: string | null };
export type CuratorCategoryResult = { slug: string; human: number; ai: number; intervalHours: number | null; published: string | null; reason: string };
export type CuratorBatchResult = { ran: boolean; published: number; categories: CuratorCategoryResult[] };

/**
 * 오픈 후 "활성화 유지": 카테고리별로 물러남 정책(curatorIntervalHours)을 계산해
 * 게시 간격이 지났으면 대기열(curator_queue)에서 한 건을 게시한다.
 * 대기열이 비었으면(Sprint 37) AI가 새 글을 써서 안전 검사를 통과하면 사람 검수 없이 게시한다 — 하루 시도 한도,
 * CURATOR_AUTOGEN=0 으로 끌 수 있다. CURATOR_ACTIVE_UNTIL 이 지나면 아무것도 게시하지 않는다.
 */
export async function runCuratorBatch(now = new Date(), opts: { generate?: CuratorGenerator; dailyMax?: number } = {}): Promise<CuratorBatchResult> {
  const generate = opts.generate ?? (config.curatorAutogen ? generateWithClaude : null);
  const dailyMax = opts.dailyMax ?? config.curatorAutogenDailyMax;
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
        `SELECT c.id, c.slug, c.name, coalesce(c.description, '') AS description,
                -- 물러남 판단은 사람이 쓴 [정보] 글 기준 (잡담·정모는 정보 공백을 메우지 않음)
                count(p.id) FILTER (WHERE NOT p.is_ai_curated AND p.post_type = 'info')::int AS human,
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
          const next = await client.query<{ id: string; seed_key: string; title: string; body: string; summary_lines: [string, string, string]; comments: string[]; reviewed: boolean }>(
            `SELECT id, seed_key, title, body, summary_lines, comments, reviewed FROM curator_queue
              WHERE category_id = $1 AND status = 'queued' ORDER BY priority, id LIMIT 1 FOR UPDATE SKIP LOCKED`,
            [s.id],
          );
          const item = next.rows[0];
          if (!item) {
            await client.query("ROLLBACK");
            results.push({ ...base, ...(await autogenerate(client, s, now, generate, dailyMax)) });
            continue;
          }
          const postId = await publishSeed(client, s.id, {
            key: item.seed_key,
            title: item.title,
            body: item.body,
            summary: item.summary_lines,
            comments: item.comments,
            reviewed: item.reviewed,
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

/**
 * 대기열이 빈 방: AI 가 새 글을 쓰고 안전 검사를 통과하면 사람 검수 없이 게시한다 (Sprint 37).
 * 시도(게시·탈락·실패)는 curator_generations 에 남고 하루 한도에 센다 — 탈락이 반복돼도 비용이 새지 않게.
 */
async function autogenerate(
  client: import("pg").PoolClient,
  s: CategoryState,
  now: Date,
  generate: CuratorGenerator | null,
  dailyMax: number,
): Promise<{ published: string | null; reason: string }> {
  if (!generate) return { published: null, reason: "queue empty (autogen off)" };
  const used = await client.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM curator_generations WHERE created_at > $1::timestamptz - interval '1 day'",
    [now.toISOString()],
  );
  if (used.rows[0]!.n >= dailyMax) return { published: null, reason: "queue empty (autogen daily limit)" };
  const recent = await client.query<{ title: string }>(
    "SELECT title FROM posts WHERE category_id = $1 ORDER BY id DESC LIMIT 40",
    [s.id],
  );
  const recentTitles = recent.rows.map((r) => r.title);
  // 정보 글과 대화 시작 글을 번갈아 (Sprint 41) — 이 방의 마지막 AI 글이 정보 글이면 이번엔 대화
  const lastAi = await client.query<{ post_type: string }>(
    "SELECT post_type FROM posts WHERE category_id = $1 AND is_ai_curated ORDER BY id DESC LIMIT 1",
    [s.id],
  );
  const kind = lastAi.rows[0]?.post_type === "chat" ? "info" : lastAi.rows[0] ? "chat" : "info";
  let draft;
  try {
    draft = await generate({ slug: s.slug, name: s.name, description: s.description }, recentTitles, kind);
  } catch (err) {
    await client.query("INSERT INTO curator_generations (category_id, status, reasons) VALUES ($1, 'failed', $2)", [s.id, String(err).slice(0, 1000)]);
    return { published: null, reason: "autogen failed" };
  }
  if (!draft) {
    await client.query("INSERT INTO curator_generations (category_id, status, reasons) VALUES ($1, 'failed', 'no draft (refusal or invalid output)')", [s.id]);
    return { published: null, reason: "autogen failed" };
  }
  draft = { ...draft, kind: draft.kind ?? kind };
  const problems = curatorSafetyProblems(draft, recentTitles);
  if (problems.length) {
    await client.query("INSERT INTO curator_generations (category_id, status, title, reasons) VALUES ($1, 'rejected', $2, $3)", [
      s.id,
      draft.title.slice(0, 200),
      problems.join(" · ").slice(0, 1000),
    ]);
    return { published: null, reason: `autogen rejected: ${problems.join(", ")}` };
  }
  await client.query("BEGIN");
  try {
    const postId = await publishSeed(client, s.id, {
      key: `auto-${s.slug}-${now.getTime().toString(36)}`,
      title: draft.title,
      body: draft.body,
      summary: draft.summary,
      comments: draft.comments,
      reviewed: false,
      postType: draft.kind === "chat" ? "chat" : "info",
    });
    await client.query("INSERT INTO curator_generations (category_id, status, title, post_id) VALUES ($1, 'published', $2, $3)", [
      s.id,
      draft.title.slice(0, 200),
      postId,
    ]);
    await client.query("COMMIT");
    return { published: postId, reason: postId ? "autogen published" : "autogen duplicate key" };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
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
      reportError(err, { kind: "job", where: "curator" });
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
