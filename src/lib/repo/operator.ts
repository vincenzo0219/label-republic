/**
 * 운영자 모더레이션 도구 (Sprint 11).
 *
 * 방장 없는 원칙: 운영자는 글을 골라 숨기거나 되살리지 않는다. 할 수 있는 일은
 *  - 탐지 배치가 찾아낸 조작(어뷰징 알림)의 신고·투표를 무효로 돌리고 자동 규칙이 다시 판단하게 하기
 *  - AI "광고 의심" 오탐 해제
 *  - 작성자 재검토 요청 기각 (수용은 위 조치로 글이 다시 보이면 자동 처리)
 *  - 불법·스팸 이름의 보드 개설 요청 거절, 중복 요청 병합
 * 이며, 모두 moderation_log 에 남아 /transparency 에 공개된다. 알림을 오탐으로 닫는 것만 내부 기록이다.
 *
 * /api/admin/* 와 /admin 은 server.ts 의 ADMIN_PASSWORD Basic 인증 뒤에 있다.
 */
import type { PoolClient } from "pg";
import { query, tx } from "../db";
import { HttpError, notFound } from "../errors";
import { assertPin } from "./pin-guard";

// ---------------------------------------------------------------------------
// 공개 조치 기록
// ---------------------------------------------------------------------------

export const MOD_ACTIONS = {
  legal_hold: "법적 임시조치",
  legal_release: "임시조치 해제",
  reports_voided: "조직적 신고 무효화",
  votes_voided: "조직적 투표 무효화",
  board_votes_voided: "보드 투표 무효화",
  suppression_released: "광고 의심 해제",
  appeal_rejected: "재검토 요청 기각",
  board_request_rejected: "보드 개설 요청 거절",
  board_request_merged: "중복 보드 요청 병합",
} as const;
export type ModAction = keyof typeof MOD_ACTIONS;

type LogInput = {
  action: ModAction;
  subjectType: "post" | "board_request" | "fingerprint";
  subjectId: string;
  note: string;
  affected?: number;
  alertId?: string | null;
  reason?: string | null;
};

async function writeLog(client: PoolClient, e: LogInput): Promise<void> {
  await client.query(
    `INSERT INTO moderation_log (action, post_id, subject_type, subject_id, reason, note, affected, alert_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      e.action,
      e.subjectType === "post" ? e.subjectId : null,
      e.subjectType,
      // 신고자 fingerprint 는 HMAC 이라도 공개 기록에 남기지 않는다
      e.subjectType === "fingerprint" ? "-" : e.subjectId,
      e.reason ?? null,
      e.note,
      e.affected ?? 0,
      e.alertId ?? null,
    ],
  );
}

const ID = /^\d{1,18}$/;
function assertId(id: string, what: string) {
  if (!ID.test(id)) throw notFound(what);
}

/** 조치로 글이 다시 보이게 됐으면(블라인드·광고 의심 모두 아님) 열린 재검토 요청을 수용 처리한다 */
async function settleAppeal(client: PoolClient, postId: string): Promise<void> {
  await client.query(
    `UPDATE appeals a SET status = 'accepted', decided_at = now(), decision_note = '운영자 조치 후 글이 다시 보입니다.'
       FROM posts p
      WHERE a.post_id = $1 AND p.id = a.post_id AND a.status = 'open' AND NOT p.is_blinded AND NOT p.is_suppressed`,
    [postId],
  );
}

// ---------------------------------------------------------------------------
// 어뷰징 알림 → 신고·투표 무효화
// ---------------------------------------------------------------------------

export type AlertKind = "report_burst" | "vote_burst" | "board_vote_burst" | "mass_reporter";
type AlertRow = {
  id: string;
  kind: AlertKind;
  subject_type: string;
  subject_id: string;
  status: "open" | "dismissed" | "actioned";
  first_seen: string;
  last_seen: string;
};

/**
 * 무효화 대상 범위: 탐지 배치의 조회 범위(알림 최초 탐지 24시간 전 ~ 마지막 탐지)에서
 * "갓 생긴 fingerprint"(첫 활동 후 1시간 이내)가 한 행동만. 탐지 기준(jobs/maintenance.ts)과 같다.
 * 대량 신고자는 해당 fingerprint 의 최초 탐지 1시간 전 ~ 마지막 탐지 사이 신고 전부.
 */
const NEW_FP = (alias: string, fpCol: string) =>
  `NOT EXISTS (SELECT 1 FROM fingerprints f WHERE f.fingerprint = ${alias}.${fpCol} AND f.first_seen <= ${alias}.created_at - interval '1 hour')`;

function targetSql(kind: AlertKind): { select: string; params: (a: AlertRow) => unknown[] } {
  switch (kind) {
    case "report_burst":
      return {
        select: `SELECT r.id FROM reports r
                  WHERE r.post_id = $1 AND r.voided_at IS NULL
                    AND r.created_at >= $2::timestamptz - interval '24 hours' AND r.created_at <= $3::timestamptz
                    AND ${NEW_FP("r", "reporter_fingerprint")}`,
        params: (a) => [a.subject_id, a.first_seen, a.last_seen],
      };
    case "vote_burst":
      return {
        select: `SELECT v.id FROM votes v
                  WHERE v.post_id = $1
                    AND v.created_at >= $2::timestamptz - interval '24 hours' AND v.created_at <= $3::timestamptz
                    AND ${NEW_FP("v", "voter_fingerprint")}`,
        params: (a) => [a.subject_id, a.first_seen, a.last_seen],
      };
    case "board_vote_burst":
      return {
        select: `SELECT v.voter_fingerprint FROM board_request_votes v
                  WHERE v.request_id = $1
                    AND v.created_at >= $2::timestamptz - interval '24 hours' AND v.created_at <= $3::timestamptz
                    AND ${NEW_FP("v", "voter_fingerprint")}`,
        params: (a) => [a.subject_id, a.first_seen, a.last_seen],
      };
    case "mass_reporter":
      return {
        // 알림에는 fingerprint 앞 12자리만 있다 (48비트 — 우연한 충돌은 사실상 없음)
        select: `SELECT r.id FROM reports r
                  WHERE r.reporter_fingerprint LIKE $1 || '%' AND r.voided_at IS NULL
                    AND r.created_at >= $2::timestamptz - interval '1 hour' AND r.created_at <= $3::timestamptz`,
        params: (a) => [a.subject_id, a.first_seen, a.last_seen],
      };
  }
}

async function loadAlert(client: PoolClient, alertId: string, lock: boolean): Promise<AlertRow> {
  assertId(alertId, "알림");
  const { rows } = await client.query<AlertRow>(
    `SELECT id, kind, subject_type, subject_id, status, first_seen, last_seen FROM abuse_alerts WHERE id = $1 ${lock ? "FOR UPDATE" : ""}`,
    [alertId],
  );
  const a = rows[0];
  if (!a) throw notFound("알림");
  if (a.kind === "mass_reporter" && !/^[0-9a-f]{12}$/.test(a.subject_id)) throw new HttpError(400, "invalid_alert", "알림 대상 형식이 올바르지 않습니다.");
  return a;
}

export type VoidPreview = { alertId: string; kind: AlertKind; count: number; status: AlertRow["status"] };

/** 무효화하면 몇 건이 대상인지 미리 본다 (실행 전 확인용) */
export async function previewAlertVoid(alertId: string): Promise<VoidPreview> {
  return tx(async (client) => {
    const a = await loadAlert(client, alertId, false);
    const t = targetSql(a.kind);
    const { rows } = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM (${t.select}) x`, t.params(a));
    return { alertId, kind: a.kind, count: rows[0]!.n, status: a.status };
  });
}

export type VoidResult = { affected: number; posts: { id: string; blinded: boolean }[]; boardRequest?: { id: string; voteCount: number; status: string } };

/** 알림이 가리키는 조작 신고·투표를 무효화하고 자동 규칙(블라인드·카운터)을 다시 계산한다. 공개 기록에 남는다. */
export async function voidAlert(alertId: string, note: string): Promise<VoidResult> {
  return tx(async (client) => {
    const a = await loadAlert(client, alertId, true);
    if (a.status !== "open") throw new HttpError(409, "alert_closed", "이미 처리된 알림입니다.");
    const t = targetSql(a.kind);
    const params = t.params(a);
    const result: VoidResult = { affected: 0, posts: [] };

    if (a.kind === "report_burst" || a.kind === "mass_reporter") {
      const { rows } = await client.query<{ post_id: string }>(
        `UPDATE reports SET voided_at = now() WHERE id IN (${t.select}) RETURNING post_id`,
        params,
      );
      result.affected = rows.length;
      for (const postId of [...new Set(rows.map((r) => r.post_id))]) {
        const { rows: b } = await client.query<{ blind: boolean }>("SELECT recount_reports($1) AS blind", [postId]);
        result.posts.push({ id: postId, blinded: b[0]!.blind });
        await settleAppeal(client, postId);
      }
      await writeLog(client, {
        action: "reports_voided",
        subjectType: a.kind === "mass_reporter" ? "fingerprint" : "post",
        subjectId: a.subject_id,
        note,
        affected: result.affected,
        alertId,
      });
    } else if (a.kind === "vote_burst") {
      // 투표 행을 지우면 카운터 트리거가 추천·비추천 수를 되돌린다
      const { rowCount } = await client.query(`DELETE FROM votes WHERE id IN (${t.select})`, params);
      result.affected = rowCount ?? 0;
      await writeLog(client, { action: "votes_voided", subjectType: "post", subjectId: a.subject_id, note, affected: result.affected, alertId });
    } else {
      const { rowCount } = await client.query(
        `DELETE FROM board_request_votes WHERE request_id = $1 AND voter_fingerprint IN (${t.select})`,
        params,
      );
      result.affected = rowCount ?? 0;
      const { rows } = await client.query<{ vote_count: number; status: string }>(
        `UPDATE board_requests SET vote_count = (SELECT count(*) FROM board_request_votes WHERE request_id = $1)
          WHERE id = $1 RETURNING vote_count, status`,
        [a.subject_id],
      );
      // 이미 승격된 보드는 되돌리지 않는다 (보드를 닫는 것은 운영자 권한 밖) — 기록에만 남긴다
      result.boardRequest = { id: a.subject_id, voteCount: rows[0]?.vote_count ?? 0, status: rows[0]?.status ?? "unknown" };
      await writeLog(client, {
        action: "board_votes_voided",
        subjectType: "board_request",
        subjectId: a.subject_id,
        note,
        affected: result.affected,
        alertId,
      });
    }
    await client.query("UPDATE abuse_alerts SET status = 'actioned', resolved_at = now(), resolution_note = $2 WHERE id = $1", [alertId, note]);
    return result;
  });
}

/** 오탐으로 닫기 — 아무것도 바꾸지 않으므로 공개 기록에는 남기지 않는다 */
export async function dismissAlert(alertId: string, note: string): Promise<void> {
  await tx(async (client) => {
    const a = await loadAlert(client, alertId, true);
    if (a.status !== "open") throw new HttpError(409, "alert_closed", "이미 처리된 알림입니다.");
    await client.query("UPDATE abuse_alerts SET status = 'dismissed', resolved_at = now(), resolution_note = $2 WHERE id = $1", [alertId, note]);
  });
}

// ---------------------------------------------------------------------------
// AI 광고 의심 오탐 해제
// ---------------------------------------------------------------------------

export async function releaseSuppression(postId: string, note: string): Promise<void> {
  assertId(postId, "게시글");
  await tx(async (client) => {
    const { rows } = await client.query<{ is_suppressed: boolean }>("SELECT is_suppressed FROM posts WHERE id = $1 FOR UPDATE", [postId]);
    if (!rows[0]) throw notFound();
    if (!rows[0].is_suppressed) throw new HttpError(409, "not_suppressed", "광고 의심 표시가 없는 글입니다.");
    // moderated_by = 'operator' 인 글은 뒤늦게 끝난 AI 판정이 다시 덮어쓰지 않는다 (글을 수정하면 다시 판정)
    await client.query(
      "UPDATE posts SET is_suppressed = false, moderation_note = '', moderated_by = 'operator' WHERE id = $1",
      [postId],
    );
    await writeLog(client, { action: "suppression_released", subjectType: "post", subjectId: postId, note });
    await settleAppeal(client, postId);
  });
}

// ---------------------------------------------------------------------------
// 재검토 요청
// ---------------------------------------------------------------------------

export type AppealStatus = { kind: "blinded" | "suppressed"; status: "open" | "accepted" | "rejected"; decision_note: string; created_at: string; decided_at: string | null };

export async function getAppeal(postId: string): Promise<AppealStatus | null> {
  if (!ID.test(postId)) return null;
  const rows = await query<AppealStatus>(
    "SELECT kind, status, decision_note, created_at, decided_at FROM appeals WHERE post_id = $1",
    [postId],
  );
  return rows[0] ?? null;
}

/** 작성자(4자리 비밀번호)가 블라인드·광고 의심 글의 재검토를 요청한다. 글당 한 번. */
export async function createAppeal(postId: string, fp: string, pin: string, message: string): Promise<AppealStatus> {
  assertId(postId, "게시글");
  await tx(async (client) => {
    const { rows } = await client.query<{ pw_hash: string; is_blinded: boolean; is_suppressed: boolean; legal_hold: boolean; is_ai_curated: boolean }>(
      "SELECT pw_hash, is_blinded, is_suppressed, legal_hold, is_ai_curated FROM posts WHERE id = $1 FOR UPDATE",
      [postId],
    );
    const p = rows[0];
    if (!p) throw notFound();
    if (p.is_ai_curated) throw new HttpError(400, "not_appealable", "AI 큐레이터 글은 재검토 요청 대상이 아닙니다.");
    if (p.legal_hold) {
      throw new HttpError(400, "legal_hold", "법적 임시조치는 재검토 요청 대신 문의 이메일로 이의를 제기해주세요.");
    }
    if (!p.is_blinded && !p.is_suppressed) throw new HttpError(400, "not_appealable", "블라인드되거나 광고 의심 표시된 글만 재검토를 요청할 수 있습니다.");
    await assertPin(`post:${postId}`, fp, pin, p.pw_hash);
    const ins = await client.query(
      "INSERT INTO appeals (post_id, kind, message) VALUES ($1, $2, $3) ON CONFLICT (post_id) DO NOTHING",
      [postId, p.is_blinded ? "blinded" : "suppressed", message],
    );
    if (ins.rowCount === 0) throw new HttpError(409, "already_appealed", "이미 재검토를 요청한 글입니다. 결과는 이 페이지에 표시됩니다.");
  });
  return (await getAppeal(postId))!;
}

export async function rejectAppeal(postId: string, note: string): Promise<void> {
  assertId(postId, "게시글");
  if (!note.trim()) throw new HttpError(400, "note_required", "기각 사유를 적어주세요. 공개됩니다.");
  await tx(async (client) => {
    const { rowCount } = await client.query(
      "UPDATE appeals SET status = 'rejected', decided_at = now(), decision_note = $2 WHERE post_id = $1 AND status = 'open'",
      [postId, note],
    );
    if (!rowCount) throw new HttpError(409, "appeal_closed", "열린 재검토 요청이 없습니다.");
    await writeLog(client, { action: "appeal_rejected", subjectType: "post", subjectId: postId, note });
  });
}

// ---------------------------------------------------------------------------
// 보드 개설 요청 거절·병합
// ---------------------------------------------------------------------------

export const BOARD_REJECT_REASONS = {
  illegal: "불법·유해 주제",
  spam: "광고·스팸",
  personal: "특정인 대상·개인정보",
} as const;
export type BoardRejectReason = keyof typeof BOARD_REJECT_REASONS;

export async function rejectBoardRequest(requestId: string, reason: BoardRejectReason, note: string): Promise<void> {
  assertId(requestId, "보드 요청");
  await tx(async (client) => {
    const { rows } = await client.query<{ status: string }>("SELECT status FROM board_requests WHERE id = $1 FOR UPDATE", [requestId]);
    if (!rows[0]) throw notFound("보드 요청");
    if (rows[0].status !== "open") throw new HttpError(409, "request_closed", "진행 중인 요청만 거절할 수 있습니다.");
    await client.query("UPDATE board_requests SET status = 'rejected' WHERE id = $1", [requestId]);
    await writeLog(client, { action: "board_request_rejected", subjectType: "board_request", subjectId: requestId, reason, note });
  });
}

/** 같은 주제의 요청을 합친다: 표를 옮기고(중복 투표자는 한 표) 원래 요청은 'duplicate' 로 닫는다. 승격 조건은 자동 규칙이 판단한다. */
export async function mergeBoardRequest(requestId: string, intoId: string, note: string): Promise<{ voteCount: number }> {
  assertId(requestId, "보드 요청");
  assertId(intoId, "보드 요청");
  if (requestId === intoId) throw new HttpError(400, "same_request", "같은 요청끼리는 병합할 수 없습니다.");
  return tx(async (client) => {
    // 교착을 피하려고 id 순서로 잠근다
    const { rows } = await client.query<{ id: string; status: string }>(
      "SELECT id, status FROM board_requests WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE",
      [[requestId, intoId]],
    );
    const from = rows.find((r) => r.id === requestId);
    const into = rows.find((r) => r.id === intoId);
    if (!from || !into) throw notFound("보드 요청");
    if (from.status !== "open" || into.status !== "open") throw new HttpError(409, "request_closed", "진행 중인 요청끼리만 병합할 수 있습니다.");
    await client.query(
      `INSERT INTO board_request_votes (request_id, voter_fingerprint, created_at)
       SELECT $2, voter_fingerprint, created_at FROM board_request_votes WHERE request_id = $1
       ON CONFLICT DO NOTHING`,
      [requestId, intoId],
    );
    await client.query("UPDATE board_requests SET status = 'duplicate', merged_into = $2 WHERE id = $1", [requestId, intoId]);
    const { rows: cnt } = await client.query<{ vote_count: number }>(
      "UPDATE board_requests SET vote_count = (SELECT count(*) FROM board_request_votes WHERE request_id = $1) WHERE id = $1 RETURNING vote_count",
      [intoId],
    );
    await writeLog(client, { action: "board_request_merged", subjectType: "board_request", subjectId: requestId, note: note || `요청 #${intoId}에 병합` });
    return { voteCount: cnt[0]!.vote_count };
  });
}

// ---------------------------------------------------------------------------
// 운영자 화면 목록
// ---------------------------------------------------------------------------

export type OpenAppeal = {
  post_id: string;
  kind: "blinded" | "suppressed";
  message: string;
  created_at: string;
  title: string;
  report_count: number;
  report_score: number;
  is_blinded: boolean;
  is_suppressed: boolean;
  moderation_note: string;
  open_alert_ids: string[];
};

export async function listOpenAppeals(): Promise<OpenAppeal[]> {
  return query<OpenAppeal>(
    `SELECT a.post_id, a.kind, a.message, a.created_at, p.title, p.report_count, p.report_score,
            p.is_blinded, p.is_suppressed, p.moderation_note,
            coalesce((SELECT array_agg(x.id::text ORDER BY x.id) FROM abuse_alerts x
                       WHERE x.status = 'open' AND x.subject_type = 'post' AND x.subject_id = a.post_id::text), '{}') AS open_alert_ids
       FROM appeals a JOIN posts p ON p.id = a.post_id
      WHERE a.status = 'open' ORDER BY a.created_at`,
  );
}

export type QueueAlert = {
  id: string;
  kind: AlertKind;
  subject_type: string;
  subject_id: string;
  severity: "warning" | "serious";
  detail: Record<string, unknown>;
  first_seen: string;
  last_seen: string;
  hits: number;
  status: "open" | "dismissed" | "actioned";
  resolution_note: string;
  resolved_at: string | null;
};

export async function listAlertsForReview(): Promise<{ open: QueueAlert[]; recent: QueueAlert[] }> {
  const cols = "id, kind, subject_type, subject_id, severity, detail, first_seen, last_seen, hits, status, resolution_note, resolved_at";
  const [open, recent] = await Promise.all([
    query<QueueAlert>(`SELECT ${cols} FROM abuse_alerts WHERE status = 'open' ORDER BY severity DESC, last_seen DESC LIMIT 100`),
    query<QueueAlert>(`SELECT ${cols} FROM abuse_alerts WHERE status <> 'open' ORDER BY resolved_at DESC NULLS LAST LIMIT 20`),
  ]);
  return { open, recent };
}

export type SuppressedPost = { id: string; title: string; spam_score: number; moderation_note: string; moderated_by: string; created_at: string; net: number; report_count: number };

export async function listSuppressed(limit = 50): Promise<SuppressedPost[]> {
  return query<SuppressedPost>(
    `SELECT id, title, spam_score, moderation_note, moderated_by, created_at, (upvotes - downvotes) AS net, report_count
       FROM posts WHERE is_suppressed AND NOT is_blinded ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
}

export type BlindedPost = { id: string; title: string; blinded_at: string; report_count: number; report_score: number; voided_reports: number; open_alert_ids: string[] };

/** 최근 자동 블라인드 (읽기 전용 — 조치는 알림을 통해서만) */
export async function listRecentAutoBlinds(limit = 30): Promise<BlindedPost[]> {
  return query<BlindedPost>(
    `SELECT p.id, p.title, p.blinded_at, p.report_count, p.report_score,
            (SELECT count(*)::int FROM reports r WHERE r.post_id = p.id AND r.voided_at IS NOT NULL) AS voided_reports,
            coalesce((SELECT array_agg(x.id::text ORDER BY x.id) FROM abuse_alerts x
                       WHERE x.status = 'open' AND x.subject_type = 'post' AND x.subject_id = p.id::text), '{}') AS open_alert_ids
       FROM posts p WHERE p.is_blinded AND NOT p.legal_hold ORDER BY p.blinded_at DESC NULLS LAST LIMIT $1`,
    [limit],
  );
}

export type OpenBoardRequestRow = { id: string; requested_name: string; description: string; vote_count: number; created_at: string };

export async function listOpenBoardRequestsForReview(): Promise<OpenBoardRequestRow[]> {
  return query<OpenBoardRequestRow>(
    "SELECT id, requested_name, description, vote_count, created_at FROM board_requests WHERE status = 'open' ORDER BY vote_count DESC, id DESC LIMIT 100",
  );
}

/** 대시보드 배지용 대기 건수 */
export async function pendingCounts(): Promise<{ appeals: number; alerts: number }> {
  const rows = await query<{ appeals: number; alerts: number }>(
    `SELECT (SELECT count(*)::int FROM appeals WHERE status = 'open') AS appeals,
            (SELECT count(*)::int FROM abuse_alerts WHERE status = 'open') AS alerts`,
  );
  return rows[0]!;
}
