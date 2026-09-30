/**
 * 출처 링크 확인 배치. 확인할 때가 된 링크를 조금씩(기본 40개) 확인한다.
 *
 * - 정상(2xx): 7일 뒤 다시 확인, 페이지 제목 저장
 * - 확정 실패(404·410·도메인 없음): 연속 2번이면 "깨짐", 하루 뒤 다시 확인 (고쳐지면 정상으로 돌아옴)
 * - 판단 보류(403·429·5xx·시간 초과 등 봇 차단일 수 있음): 상태를 바꾸지 않고 하루 뒤 다시 확인
 * - 내부 주소로 향함(SSRF 차단): 즉시 "깨짐", 30일 뒤 다시 확인
 *
 * 같은 사이트에는 한 번에 한 요청만 보낸다. advisory lock 으로 여러 인스턴스 중 한 곳에서만 실행된다.
 */
import { pool } from "../db";
import { checkLink, type LinkCheckOptions, type LinkCheckResult } from "../link-check";
import { reportError } from "../error-tracking";

const LOCK_KEY = 4_823_005;
const CONCURRENCY = 4;

export type SourceCheckResult = { ran: boolean; checked: number; broken: number };

type Due = { id: string; url: string; host: string; fail_count: number };

function nextCheck(now: Date, days: number) {
  return new Date(now.getTime() + days * 86400_000).toISOString();
}

export async function runSourceCheckBatch(
  limit = 40,
  now = new Date(),
  opts: LinkCheckOptions & { check?: (url: string) => Promise<LinkCheckResult> } = {},
): Promise<SourceCheckResult> {
  const client = await pool().connect();
  try {
    const lock = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_KEY]);
    if (!lock.rows[0]!.ok) return { ran: false, checked: 0, broken: 0 };
    const run = await client.query<{ id: string }>("INSERT INTO source_check_runs DEFAULT VALUES RETURNING id");
    let checked = 0;
    let broken = 0;
    try {
      const { rows } = await client.query<Due>(
        `SELECT s.id, s.url, s.host, s.fail_count FROM post_sources s JOIN posts p ON p.id = s.post_id
          WHERE s.next_check_at <= $1::timestamptz AND NOT p.is_blinded
          ORDER BY s.next_check_at LIMIT $2`,
        [now.toISOString(), limit],
      );
      // 사이트별로 묶어 같은 사이트는 차례로, 다른 사이트끼리는 동시에
      const byHost = new Map<string, Due[]>();
      for (const r of rows) byHost.set(r.host, [...(byHost.get(r.host) ?? []), r]);
      const queues = [...byHost.values()];
      const check = opts.check ?? ((url: string) => checkLink(url, opts));
      const worker = async () => {
        for (let q = queues.shift(); q; q = queues.shift()) {
          for (const s of q) {
            const r = await check(s.url);
            checked++;
            if (await record(s, r, now)) broken++;
          }
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      await client.query("UPDATE source_check_runs SET finished_at = now(), checked = $2, broken = $3 WHERE id = $1", [run.rows[0]!.id, checked, broken]);
      await client.query("DELETE FROM source_check_runs WHERE started_at < $1::timestamptz - interval '30 days'", [now.toISOString()]);
      return { ran: true, checked, broken };
    } catch (err) {
      await client.query("UPDATE source_check_runs SET finished_at = now(), error = $2 WHERE id = $1", [run.rows[0]!.id, String(err)]).catch(() => {});
      throw err;
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

/** 결과 반영. 이번에 새로 깨짐으로 바뀌었으면 true */
async function record(s: Due, r: LinkCheckResult, now: Date): Promise<boolean> {
  const q = (sql: string, args: unknown[]) => pool().query(sql, args);
  const status = r.httpStatus ?? null;
  switch (r.outcome) {
    case "ok":
      await q(
        `UPDATE post_sources SET status = 'ok', fail_count = 0, http_status = $2, page_title = coalesce($3, page_title),
           checked_at = $4, next_check_at = $5 WHERE id = $1`,
        [s.id, status, r.title ?? null, now.toISOString(), nextCheck(now, 7)],
      );
      return false;
    case "gone": {
      const fails = s.fail_count + 1;
      const res = await q(
        `UPDATE post_sources SET fail_count = $2::smallint, http_status = $3, checked_at = $4, next_check_at = $5,
           status = CASE WHEN $2::smallint >= 2 THEN 'broken'::source_status ELSE status END
         WHERE id = $1 RETURNING (status = 'broken') AS broken`,
        [s.id, fails, status, now.toISOString(), nextCheck(now, 1)],
      );
      return fails === 2 && res.rows[0]?.broken === true;
    }
    case "blocked":
      await q(
        `UPDATE post_sources SET status = 'broken', fail_count = GREATEST(fail_count, 2), http_status = NULL,
           checked_at = $2, next_check_at = $3 WHERE id = $1`,
        [s.id, now.toISOString(), nextCheck(now, 30)],
      );
      return true;
    default:
      await q(`UPDATE post_sources SET http_status = $2, checked_at = $3, next_check_at = $4 WHERE id = $1`, [s.id, status, now.toISOString(), nextCheck(now, 1)]);
      return false;
  }
}

export function startSourceCheckScheduler(intervalMs: number): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runSourceCheckBatch();
      if (r.broken) console.log(`[sources] 새로 깨진 출처 링크 ${r.broken}개 (확인 ${r.checked}개)`);
    } catch (err) {
      console.error("[sources] batch failed:", (err as Error).message);
      reportError(err, { kind: "job", where: "sources" });
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
