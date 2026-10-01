import type { PoolClient } from "pg";
import { pool } from "../db";
import { promotePendingBoardRequests } from "../repo/board-requests";
import { sweepOrphanImages } from "../repo/images";
import { expireMeetups } from "../repo/meetups";
import { refreshRenewals } from "../repo/renewals";
import { closeDueProposals, findRingVotes } from "../repo/rules";
import { reportError } from "../error-tracking";

const MAINTENANCE_LOCK_KEY = 4_823_003;

export type AlertCandidate = {
  kind: "report_burst" | "vote_burst" | "board_vote_burst" | "mass_reporter" | "rule_vote_ring";
  subjectType: "post" | "board_request" | "fingerprint" | "rule_proposal";
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
  // JS 시각은 ms, DB 시각은 µs 단위 — 탐지 직전 같은 ms 안에 들어온 행동이 "지금 이후"로 빠지지 않게 1ms 올린다.
  // (빠지면 탐지는 되는데 알림의 last_seen 보다 늦어 무효화 대상에서도 빠진다 — CI 에서 드물게 재현)
  now = new Date(now.getTime() + 1);
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

  // 규칙 투표: 자격을 갓 채운 계정의 몰림, 같은 망에서 몰린 새 계정 표 (Sprint 23)
  for (const r of await findRingVotes(client)) {
    alerts.push({
      kind: "rule_vote_ring",
      subjectType: "rule_proposal",
      subjectId: r.proposalId,
      // 이 표들을 빼면 가결 여부가 바뀌면 심각
      severity: r.flips ? "serious" : "warning",
      detail: {
        rule: r.key, from: r.from, to: r.to, flagged: r.flagged, flaggedYes: r.flaggedYes, flaggedNo: r.flaggedNo,
        freshEligible: r.fresh, sameNetwork: r.sameNet, flipsOutcome: r.flips, windowStart: r.windowStart, latestAt: r.latestAt,
      },
    });
  }

  for (const a of alerts) {
    await client.query(
      `INSERT INTO abuse_alerts (kind, subject_type, subject_id, severity, detail, first_seen, last_seen)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       ON CONFLICT (kind, subject_type, subject_id) DO UPDATE
         SET detail = EXCLUDED.detail, last_seen = EXCLUDED.last_seen,
             severity = GREATEST(abuse_alerts.severity, EXCLUDED.severity), hits = abuse_alerts.hits + 1,
             -- 운영자가 처리(무효화·오탐 닫기)한 뒤에 시작된 새 집중이면 알림을 다시 연다
             status = CASE WHEN ${REOPEN} THEN 'open'::alert_status ELSE abuse_alerts.status END,
             first_seen = CASE WHEN ${REOPEN} THEN EXCLUDED.first_seen ELSE abuse_alerts.first_seen END,
             resolved_at = CASE WHEN ${REOPEN} THEN NULL ELSE abuse_alerts.resolved_at END,
             resolution_note = CASE WHEN ${REOPEN} THEN '' ELSE abuse_alerts.resolution_note END
       WHERE abuse_alerts.detail IS DISTINCT FROM EXCLUDED.detail`,
      [a.kind, a.subjectType, a.subjectId, a.severity, JSON.stringify(a.detail), now.toISOString()],
    );
  }
  return alerts;
}

// 새 집중의 시작 시각(대량 신고자는 최근 1시간 창의 시작)이 처리 시각보다 뒤인가.
// 규칙 투표 조작(rule_vote_ring)은 가장 최근 의심 표로 본다 — 작은 의심을 오탐으로 닫게 한 뒤 몰표를 넣어도 다시 열리게 (Sprint 29)
const REOPEN = `(abuse_alerts.status <> 'open' AND abuse_alerts.resolved_at IS NOT NULL
  AND coalesce((EXCLUDED.detail->>'latestAt')::timestamptz, (EXCLUDED.detail->>'windowStart')::timestamptz, EXCLUDED.last_seen - interval '1 hour') > abuse_alerts.resolved_at)`;

export type MaintenanceResult = {
  ran: boolean;
  alerts: number;
  promoted: string[];
  pruned: { pageViews: number; alerts: number; orphanImages: number };
  expiredMeetups: number;
  rulesClosed?: number;
  renewalsConfirmed?: number;
};

/**
 * 5분마다: 어뷰징 탐지 → 보류된 방 승격 → 오래된 지표·알림 정리.
 * advisory lock 으로 여러 인스턴스 중 한 곳에서만 실행된다.
 */
export async function runMaintenance(now = new Date()): Promise<MaintenanceResult> {
  const client = await pool().connect();
  try {
    const lock = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [MAINTENANCE_LOCK_KEY]);
    if (!lock.rows[0]!.ok) return { ran: false, alerts: 0, promoted: [], pruned: { pageViews: 0, alerts: 0, orphanImages: 0 }, expiredMeetups: 0 };
    const run = await client.query<{ id: string }>("INSERT INTO maintenance_runs DEFAULT VALUES RETURNING id");
    const runId = run.rows[0]!.id;
    try {
      const alerts = await scanAbuse(client, now);
      const promotions = await promotePendingBoardRequests(undefined, undefined, now);
      const promoted = promotions.filter((p) => p.outcome === "promoted").map((p) => p.id);
      const expiredMeetups = await expireMeetups(client, now);
      // 커뮤니티 규칙 투표 마감 → 가결이면 규칙 값 변경 (Sprint 21)
      const closedRules = await closeDueProposals(now);
      // 제품 리뉴얼 기록 (Sprint 25) — 바뀐 제품만, 하루 한 번 전체
      const renewals = await refreshRenewals(client, now);
      // 규칙 투표의 망 식별값은 조작 탐지에만 쓰므로 투표가 끝나고 30일 뒤 지운다 (Sprint 23)
      await client.query(
        `UPDATE rule_votes SET net_hash = NULL WHERE net_hash IS NOT NULL
            AND proposal_id IN (SELECT id FROM rule_proposals WHERE status <> 'open' AND closed_at < $1::timestamptz - interval '30 days')`,
        [now.toISOString()],
      );
      // 브랜드 별칭 제안·투표의 망 변환값(Sprint 31)은 중복 표 판단에만 쓰므로 처리되고 30일 뒤 지운다 (Sprint 33)
      await client.query(
        `UPDATE brand_alias_votes SET voter_net = NULL WHERE voter_net IS NOT NULL
            AND proposal_id IN (SELECT id FROM brand_alias_proposals WHERE status <> 'open' AND resolved_at < $1::timestamptz - interval '30 days')`,
        [now.toISOString()],
      );
      await client.query(
        `UPDATE brand_alias_proposals SET proposer_net = NULL
          WHERE proposer_net IS NOT NULL AND status <> 'open' AND resolved_at < $1::timestamptz - interval '30 days'`,
        [now.toISOString()],
      );
      // 성분명 별칭 제안·투표(Sprint 35)도 같은 기준
      await client.query(
        `UPDATE attr_alias_votes SET voter_net = NULL WHERE voter_net IS NOT NULL
            AND proposal_id IN (SELECT id FROM attr_alias_proposals WHERE status <> 'open' AND resolved_at < $1::timestamptz - interval '30 days')`,
        [now.toISOString()],
      );
      await client.query(
        `UPDATE attr_alias_proposals SET proposer_net = NULL
          WHERE proposer_net IS NOT NULL AND status <> 'open' AND resolved_at < $1::timestamptz - interval '30 days'`,
        [now.toISOString()],
      );
      // 제보(Sprint 36): 식별값·망 변환값은 도배 방지·"나도 겪었어요" 중복 판단에만 쓰므로 처리되고 30일 뒤 지우고,
      // 자세한 내용·기기 정보는 처리되고 1년 뒤 지운다 (제목·상태·공개 답변은 현황판 기록으로 남김)
      await client.query(
        `UPDATE feedback SET reporter_fingerprint = NULL, reporter_net = NULL
          WHERE (reporter_fingerprint IS NOT NULL OR reporter_net IS NOT NULL) AND resolved_at < $1::timestamptz - interval '30 days'`,
        [now.toISOString()],
      );
      await client.query(
        `UPDATE feedback_votes SET voter_net = NULL WHERE voter_net IS NOT NULL
            AND feedback_id IN (SELECT id FROM feedback WHERE resolved_at < $1::timestamptz - interval '30 days')`,
        [now.toISOString()],
      );
      await client.query(
        `UPDATE feedback SET body = '', env = '{}' WHERE body <> '' AND resolved_at < $1::timestamptz - interval '365 days'`,
        [now.toISOString()],
      );
      // 쓰기 제한용 브라우저 종류 값(Sprint 37)은 30일 창만 쓰므로 30일 뒤 지운다
      await client.query(
        `UPDATE posts SET author_agent = NULL WHERE author_agent IS NOT NULL AND created_at < $1::timestamptz - interval '30 days'`,
        [now.toISOString()],
      );
      // 글의 망 대역 변환값(Sprint 29)은 리뉴얼 판단에만 쓰므로, 표시값(라벨) 수치가 없는 글은 30일 뒤 지운다
      await client.query(
        `UPDATE posts p SET author_net = NULL
          WHERE p.author_net IS NOT NULL AND p.created_at < $1::timestamptz - interval '30 days'
            AND NOT EXISTS (SELECT 1 FROM product_facts f WHERE f.post_id = p.id AND f.kind = 'label')`,
        [now.toISOString()],
      );
      // 개인 식별 가능성을 줄이기 위해 원본 조회 기록은 400일, 알림은 90일만 보관
      const pv = await client.query("DELETE FROM page_views WHERE occurred_at < $1::timestamptz - interval '400 days'", [now.toISOString()]);
      const al = await client.query("DELETE FROM abuse_alerts WHERE last_seen < $1::timestamptz - interval '90 days'", [now.toISOString()]);
      await client.query("DELETE FROM maintenance_runs WHERE started_at < $1::timestamptz - interval '30 days'", [now.toISOString()]);
      // fingerprint 활동 이력도 조회 기록과 같은 400일 보관 (개인정보처리방침과 일치)
      await client.query("DELETE FROM fingerprints WHERE last_seen < $1::timestamptz - interval '400 days'", [now.toISOString()]);
      await client.query("DELETE FROM visitors WHERE last_seen < $1::timestamptz - interval '400 days'", [now.toISOString()]);
      await client.query("DELETE FROM rate_limits WHERE expires_at < now()");
      await client.query("DELETE FROM idempotency_keys WHERE created_at < $1::timestamptz - interval '24 hours'", [now.toISOString()]);
      // 서버 오류 기록: 해결 표시한 것은 30일, 나머지는 마지막 발생 후 90일
      await client.query(
        "DELETE FROM error_events WHERE (resolved_at < $1::timestamptz - interval '30 days') OR last_seen < $1::timestamptz - interval '90 days'",
        [now.toISOString()],
      );
      // 올리기만 하고 글에 붙이지 않은 이미지 (24시간 경과)
      const orphanImages = await sweepOrphanImages(now);
      const result: MaintenanceResult = {
        ran: true,
        alerts: alerts.length,
        promoted,
        pruned: { pageViews: pv.rowCount ?? 0, alerts: al.rowCount ?? 0, orphanImages },
        expiredMeetups,
        rulesClosed: closedRules.length,
        renewalsConfirmed: renewals.confirmed,
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
      reportError(err, { kind: "job", where: "maintenance" });
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
