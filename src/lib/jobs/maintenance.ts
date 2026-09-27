import type { PoolClient } from "pg";
import { pool } from "../db";
import { promotePendingBoardRequests } from "../repo/board-requests";
import { expireMeetups } from "../repo/meetups";

const MAINTENANCE_LOCK_KEY = 4_823_003;

export type AlertCandidate = {
  kind: "report_burst" | "vote_burst" | "board_vote_burst" | "mass_reporter";
  subjectType: "post" | "board_request" | "fingerprint";
  subjectId: string;
  severity: "warning" | "serious";
  detail: Record<string, unknown>;
};

/**
 * "갓 생긴 fingerprint"(첫 활동 후 1시간 이내에 한 행동)들이 짧은 창(15분)에 한 대상으로 몰리는 패턴을 찾는다.
 * table/fpCol/subjectCol 은 코드 상수만 넘긴다 (사용자 입력 아님).
 */
async function burstCandidates(
  client: PoolClient,
  now: Date,
  table: "reports" | "votes" | "board_request_votes",
  fpCol: string,
  subjectCol: string,
  minEvents: number,
): Promise<{ subject: string; n: number; n_new: number; window_start: string }[]> {
  const { rows } = await client.query(
    `WITH ev AS (
       SELECT e.${subjectCol}::text AS subject, e.created_at,
              coalesce(f.first_seen > e.created_at - interval '1 hour', true) AS is_new
         FROM ${table} e LEFT JOIN fingerprints f ON f.fingerprint = e.${fpCol}
        WHERE e.created_at > $1::timestamptz - interval '24 hours' AND e.created_at <= $1::timestamptz
     ), win AS (
       -- 각 이벤트에서 시작하는 15분 창의 이벤트 수를 윈도 함수로 한 번에 센다.
       -- (이전의 자기 조인은 대상별 O(n²) — 4만 건 합성 데이터에서 4.8초 → 55ms)
       SELECT subject, created_at AS window_start,
              (count(*) OVER w)::int AS n,
              (count(*) FILTER (WHERE is_new) OVER w)::int AS n_new
         FROM ev
       WINDOW w AS (PARTITION BY subject ORDER BY created_at RANGE BETWEEN CURRENT ROW AND interval '15 minutes' FOLLOWING)
     )
     SELECT DISTINCT ON (subject) subject, n, n_new, window_start
       FROM win
      WHERE n >= $2 AND n_new::float / n >= 0.75
      ORDER BY subject, n DESC, window_start`,
    [now.toISOString(), minEvents],
  );
  return rows;
}

/** 어뷰징 패턴 탐지. 자동 처분은 하지 않고 알림만 남긴다 (방장 없는 구조 — 판단 근거를 투명하게 쌓는 용도). */
export async function scanAbuse(client: PoolClient, now = new Date()): Promise<AlertCandidate[]> {
  const alerts: AlertCandidate[] = [];

  for (const r of await burstCandidates(client, now, "reports", "reporter_fingerprint", "post_id", 4)) {
    const post = await client.query<{ is_blinded: boolean; title: string }>("SELECT is_blinded, title FROM posts WHERE id = $1", [r.subject]);
    alerts.push({
      kind: "report_burst",
      subjectType: "post",
      subjectId: r.subject,
      // 조직적 신고로 이미 블라인드까지 갔다면 더 심각
      severity: post.rows[0]?.is_blinded ? "serious" : "warning",
      detail: { reports: r.n, fromNewFingerprints: r.n_new, windowStart: r.window_start, title: post.rows[0]?.title ?? null, blinded: post.rows[0]?.is_blinded ?? null },
    });
  }

  for (const r of await burstCandidates(client, now, "votes", "voter_fingerprint", "post_id", 10)) {
    const post = await client.query<{ title: string; upvotes: number; downvotes: number }>("SELECT title, upvotes, downvotes FROM posts WHERE id = $1", [r.subject]);
    alerts.push({
      kind: "vote_burst",
      subjectType: "post",
      subjectId: r.subject,
      severity: r.n >= 30 ? "serious" : "warning",
      detail: { votes: r.n, fromNewFingerprints: r.n_new, windowStart: r.window_start, title: post.rows[0]?.title ?? null, upvotes: post.rows[0]?.upvotes, downvotes: post.rows[0]?.downvotes },
    });
  }

  for (const r of await burstCandidates(client, now, "board_request_votes", "voter_fingerprint", "request_id", 10)) {
    const req = await client.query<{ requested_name: string; status: string }>("SELECT requested_name, status FROM board_requests WHERE id = $1", [r.subject]);
    alerts.push({
      kind: "board_vote_burst",
      subjectType: "board_request",
      subjectId: r.subject,
      severity: req.rows[0]?.status === "promoted" ? "serious" : "warning",
      detail: { votes: r.n, fromNewFingerprints: r.n_new, windowStart: r.window_start, name: req.rows[0]?.requested_name ?? null, status: req.rows[0]?.status ?? null },
    });
  }

  const mass = await client.query<{ fp: string; n: number }>(
    `SELECT reporter_fingerprint AS fp, count(*)::int AS n FROM reports
      WHERE created_at > $1::timestamptz - interval '1 hour' AND created_at <= $1::timestamptz
      GROUP BY reporter_fingerprint HAVING count(*) >= 10`,
    [now.toISOString()],
  );
  for (const m of mass.rows) {
    alerts.push({
      kind: "mass_reporter",
      subjectType: "fingerprint",
      // 대시보드에는 앞 12자리만 노출 — fingerprint 자체도 HMAC 이라 원 IP로 되돌릴 수 없다
      subjectId: m.fp.slice(0, 12),
      severity: m.n >= 30 ? "serious" : "warning",
      detail: { reportsLastHour: m.n, note: "신고 가중치 자동 하향 중 (0.5 / 0.2)" },
    });
  }

  for (const a of alerts) {
    await client.query(
      `INSERT INTO abuse_alerts (kind, subject_type, subject_id, severity, detail, first_seen, last_seen)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       ON CONFLICT (kind, subject_type, subject_id) DO UPDATE
         SET detail = EXCLUDED.detail, last_seen = EXCLUDED.last_seen,
             severity = GREATEST(abuse_alerts.severity, EXCLUDED.severity), hits = abuse_alerts.hits + 1
       WHERE abuse_alerts.detail IS DISTINCT FROM EXCLUDED.detail`,
      [a.kind, a.subjectType, a.subjectId, a.severity, JSON.stringify(a.detail), now.toISOString()],
    );
  }
  return alerts;
}

export type MaintenanceResult = {
  ran: boolean;
  alerts: number;
  promoted: string[];
  pruned: { pageViews: number; alerts: number };
  expiredMeetups: number;
};

/**
 * 5분마다: 어뷰징 탐지 → 보류된 보드 승격 → 오래된 지표·알림 정리.
 * advisory lock 으로 여러 인스턴스 중 한 곳에서만 실행된다.
 */
export async function runMaintenance(now = new Date()): Promise<MaintenanceResult> {
  const client = await pool().connect();
  try {
    const lock = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [MAINTENANCE_LOCK_KEY]);
    if (!lock.rows[0]!.ok) return { ran: false, alerts: 0, promoted: [], pruned: { pageViews: 0, alerts: 0 }, expiredMeetups: 0 };
    const run = await client.query<{ id: string }>("INSERT INTO maintenance_runs DEFAULT VALUES RETURNING id");
    const runId = run.rows[0]!.id;
    try {
      const alerts = await scanAbuse(client, now);
      const promotions = await promotePendingBoardRequests(undefined, undefined, now);
      const promoted = promotions.filter((p) => p.outcome === "promoted").map((p) => p.id);
      const expiredMeetups = await expireMeetups(client, now);
      // 개인 식별 가능성을 줄이기 위해 원본 조회 기록은 400일, 알림은 90일만 보관
      const pv = await client.query("DELETE FROM page_views WHERE occurred_at < $1::timestamptz - interval '400 days'", [now.toISOString()]);
      const al = await client.query("DELETE FROM abuse_alerts WHERE last_seen < $1::timestamptz - interval '90 days'", [now.toISOString()]);
      await client.query("DELETE FROM maintenance_runs WHERE started_at < $1::timestamptz - interval '30 days'", [now.toISOString()]);
      // fingerprint 활동 이력도 조회 기록과 같은 400일 보관 (개인정보처리방침과 일치)
      await client.query("DELETE FROM fingerprints WHERE last_seen < $1::timestamptz - interval '400 days'", [now.toISOString()]);
      await client.query("DELETE FROM visitors WHERE last_seen < $1::timestamptz - interval '400 days'", [now.toISOString()]);
      await client.query("DELETE FROM rate_limits WHERE expires_at < now()");
      const result: MaintenanceResult = {
        ran: true,
        alerts: alerts.length,
        promoted,
        pruned: { pageViews: pv.rowCount ?? 0, alerts: al.rowCount ?? 0 },
        expiredMeetups,
      };
      await client.query("UPDATE maintenance_runs SET finished_at = now(), detail = $2 WHERE id = $1", [runId, JSON.stringify(result)]);
      return result;
    } catch (err) {
      await client
        .query("UPDATE maintenance_runs SET finished_at = now(), error = $2 WHERE id = $1", [runId, String(err)])
        .catch(() => {});
      throw err;
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [MAINTENANCE_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

export function startMaintenanceScheduler(intervalMs: number): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runMaintenance();
      if (r.promoted.length) console.log(`[maintenance] promoted board requests: ${r.promoted.join(", ")}`);
    } catch (err) {
      console.error("[maintenance] failed:", (err as Error).message);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
