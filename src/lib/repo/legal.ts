/**
 * 법적 요청에 의한 임시조치 (정보통신망법 제44조의2). 운영자만 /admin 에서 실행할 수 있고,
 * 모든 조치는 moderation_log 에 남아 /transparency 에 공개된다.
 * 임시조치된 글은 자동 블라인드와 같은 경로(is_blinded)로 숨겨져 피드·검색·투표·댓글에서 빠진다.
 */
import { deleteSnapshot } from "../snapshots";
import { query, tx } from "../db";
import { HttpError, notFound } from "../errors";
import { getRule } from "./rules";

export const LEGAL_REASONS = {
  defamation: "명예훼손",
  privacy: "사생활·개인정보 침해",
  copyright: "저작권 침해",
  illegal: "불법정보",
  court_order: "법원·수사기관 요청",
} as const;
export type LegalReason = keyof typeof LEGAL_REASONS;

export const LEGAL_HOLD_DAYS = 30;

export async function applyLegalHold(postId: string, reason: LegalReason, note: string): Promise<void> {
  if (!/^\d{1,18}$/.test(postId)) throw notFound();
  await tx(async (client) => {
    const p = await client.query<{ legal_hold: boolean }>("SELECT legal_hold FROM posts WHERE id = $1 FOR UPDATE", [postId]);
    if (!p.rows[0]) throw notFound();
    if (p.rows[0].legal_hold) throw new HttpError(409, "already_held", "이미 임시조치된 게시물입니다.");
    await client.query(
      `UPDATE posts SET legal_hold = true, legal_hold_reason = $2, legal_hold_at = now(),
         legal_hold_until = now() + make_interval(days => $3), is_blinded = true, blinded_at = coalesce(blinded_at, now())
       WHERE id = $1`,
      [postId, reason, LEGAL_HOLD_DAYS],
    );
    await client.query("INSERT INTO moderation_log (action, post_id, subject_id, reason, note) VALUES ('legal_hold', $1, $4, $2, $3)", [postId, reason, note, postId]);
  });
  // 임시조치한 글은 읽기 전용 모드 저장본에서도 바로 지운다 (Sprint 29)
  await deleteSnapshot(`/posts/${postId}`);
}

/** 임시조치 해제. 신고 누적 블라인드 조건을 여전히 만족하면 블라인드는 유지한다. */
export async function releaseLegalHold(postId: string, note: string): Promise<{ stillBlinded: boolean }> {
  if (!/^\d{1,18}$/.test(postId)) throw notFound();
  return tx(async (client) => {
    const p = await client.query<{ legal_hold: boolean; legal_hold_reason: string; report_count: number; report_score: number }>(
      "SELECT legal_hold, legal_hold_reason, report_count, report_score FROM posts WHERE id = $1 FOR UPDATE",
      [postId],
    );
    const row = p.rows[0];
    if (!row) throw notFound();
    if (!row.legal_hold) throw new HttpError(409, "not_held", "임시조치 중인 게시물이 아닙니다.");
    const blindAt = await getRule("post_blind_reports");
    const stillBlinded = row.report_count >= blindAt && row.report_score >= blindAt;
    await client.query(
      `UPDATE posts SET legal_hold = false, legal_hold_until = NULL, is_blinded = $2,
         blinded_at = CASE WHEN $2 THEN blinded_at ELSE NULL END
       WHERE id = $1`,
      [postId, stillBlinded],
    );
    await client.query("INSERT INTO moderation_log (action, post_id, subject_id, reason, note) VALUES ('legal_release', $1, $4, $2, $3)", [
      postId,
      row.legal_hold_reason,
      note,
      postId,
    ]);
    return { stillBlinded };
  });
}

export type ModerationLogRow = {
  id: string;
  action: import("./operator").ModAction;
  post_id: string | null;
  subject_type: "post" | "board_request" | "fingerprint" | "product" | "rule_proposal" | "brand_alias" | "attr_alias";
  subject_id: string;
  /** 법적 임시조치 사유(LegalReason) 또는 보드 요청 거절 사유(BoardRejectReason) */
  reason: string | null;
  note: string;
  affected: number;
  created_at: string;
};

export async function moderationLog(limit = 100): Promise<ModerationLogRow[]> {
  return query<ModerationLogRow>(
    "SELECT id, action, post_id, subject_type, subject_id, reason, note, affected, created_at FROM moderation_log ORDER BY id DESC LIMIT $1",
    [limit],
  );
}

export type HeldPost = { id: string; title: string; reason: LegalReason; held_at: string; until: string; overdue: boolean };

/** 운영자 화면용: 현재 임시조치 중인 글 (30일이 지나 재검토가 필요한 글 표시) */
export async function activeLegalHolds(): Promise<HeldPost[]> {
  return query<HeldPost>(
    `SELECT id, title, legal_hold_reason AS reason, legal_hold_at AS held_at, legal_hold_until AS until,
            legal_hold_until < now() AS overdue
       FROM posts WHERE legal_hold ORDER BY legal_hold_until`,
  );
}

export type MonthlyStats = { month: string; auto_blinds: number; legal_holds: number; legal_releases: number; corrections: number };

/** 공개 투명성 통계: 최근 6개월 자동 블라인드 / 임시조치 / 해제 건수 */
export async function transparencyStats(): Promise<MonthlyStats[]> {
  // 월마다 전체 글을 다시 훑지 않게, 최근 6개월 범위만 한 번씩 월별로 묶어 센다 (Sprint 34 리허설: 글 20만 건에서 1.6초 → 인덱스·한 번 훑기)
  return query<MonthlyStats>(
    `WITH m AS (
       SELECT to_char(d, 'YYYY-MM') AS month
         FROM generate_series(date_trunc('month', now() AT TIME ZONE 'Asia/Seoul') - interval '5 months',
                              date_trunc('month', now() AT TIME ZONE 'Asia/Seoul'), interval '1 month') d
     ), since AS (
       SELECT (date_trunc('month', now() AT TIME ZONE 'Asia/Seoul') - interval '5 months') AT TIME ZONE 'Asia/Seoul' AS t
     ), b AS (
       SELECT to_char(p.blinded_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') AS month, count(*)::int AS n
         FROM posts p, since WHERE p.is_blinded AND NOT p.legal_hold AND p.blinded_at >= since.t GROUP BY 1
     ), l AS (
       SELECT to_char(l.created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') AS month,
              count(*) FILTER (WHERE l.action = 'legal_hold')::int AS holds,
              count(*) FILTER (WHERE l.action = 'legal_release')::int AS releases,
              -- 운영자 정정 (조작 무효화·AI 오탐 해제·재검토 기각·보드 요청 정리·제품 병합)
              count(*) FILTER (WHERE l.action NOT IN ('legal_hold', 'legal_release'))::int AS corrections
         FROM moderation_log l, since WHERE l.created_at >= since.t GROUP BY 1
     )
     SELECT m.month, coalesce(b.n, 0) AS auto_blinds, coalesce(l.holds, 0) AS legal_holds,
            coalesce(l.releases, 0) AS legal_releases, coalesce(l.corrections, 0) AS corrections
       FROM m LEFT JOIN b ON b.month = m.month LEFT JOIN l ON l.month = m.month
      ORDER BY m.month DESC`,
  );
}
