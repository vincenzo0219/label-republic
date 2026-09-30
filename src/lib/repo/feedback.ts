/**
 * 피드백·버그 제보 (Sprint 36).
 *
 * - 누구나 제보: 종류·제목·내용 + (이용자가 보고 고른) 보던 화면·기기 정보. 쓴 브라우저에는 "번호.증표"를 돌려준다.
 * - 공개 현황판: 제목·종류·상태·운영자 답변·"나도 겪었어요" 수·보던 화면만. 자세한 내용·기기 정보는 운영자와 증표를 가진 브라우저만.
 * - 운영자: 상태(접수 → 확인함 → 고치는 중 → 고침 / 그대로 둠 / 같은 제보 있음 / 가림)와 공개 답변. 가려도 가렸다는 사실과 사유는 보인다.
 */
import { readFileSync } from "node:fs";
import type { PoolClient } from "pg";
import path from "node:path";
import { query, tx } from "../db";
import { feedbackRef } from "../comment-token";
import { HttpError, notFound } from "../errors";
import { FEEDBACK_STATUS, OPEN_STATUSES, type FeedbackEnv, type FeedbackKind, type FeedbackStatus } from "../feedback";
import { heuristicSpam } from "../moderation";

const ID = /^\d{1,18}$/;
export const MAX_PER_NETWORK_PER_DAY = 20;
/** 이 점수 이상이면 광고로 보고 받지 않는다 (규칙 기반 — 제보는 AI 분류를 거치지 않는다) */
export const SPAM_REJECT_SCORE = 0.6;

let buildId: string | null | undefined;
/** 지금 돌고 있는 앱 빌드 (제보가 어느 배포에서 왔는지) */
function appBuild(): string | null {
  if (buildId !== undefined) return buildId;
  try {
    buildId = readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim().slice(0, 40) || null;
  } catch {
    buildId = null;
  }
  return buildId;
}

function cleanEnv(env: FeedbackEnv | null | undefined): FeedbackEnv {
  if (!env) return {};
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : undefined);
  const out: FeedbackEnv = {
    browser: s(env.browser, 40),
    os: s(env.os, 40),
    viewport: typeof env.viewport === "string" && /^\d{2,5}×\d{2,5}$/.test(env.viewport) ? env.viewport : undefined,
    standalone: typeof env.standalone === "boolean" ? env.standalone : undefined,
    online: typeof env.online === "boolean" ? env.online : undefined,
  };
  const app = appBuild();
  if (app) out.app = app;
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as FeedbackEnv;
}

export async function createFeedback(input: {
  kind: FeedbackKind;
  title: string;
  body: string;
  pagePath: string;
  env: FeedbackEnv | null;
  fingerprint: string;
  net: string | null;
}): Promise<{ id: string; ref: string }> {
  const spam = heuristicSpam(input.title, input.body);
  if (spam.score >= SPAM_REJECT_SCORE) {
    throw new HttpError(400, "looks_like_spam", `광고·홍보로 보이는 내용은 받지 않아요 (${spam.reasons.join(", ")}). 사이트 문제라면 링크·연락처를 빼고 다시 적어 주세요.`);
  }
  return tx(async (client) => {
    if (input.net) {
      const { rows } = await client.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM feedback WHERE reporter_net = $1 AND created_at > now() - interval '1 day'",
        [input.net],
      );
      if (rows[0]!.n >= MAX_PER_NETWORK_PER_DAY) throw new HttpError(429, "rate_limited", "같은 곳(접속 망)에서 오늘 보낸 제보가 많아요. 내일 다시 보내 주세요.");
    }
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO feedback (kind, title, body, page_path, env, reporter_fingerprint, reporter_net)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id::text`,
      [input.kind, input.title, input.body, input.pagePath, JSON.stringify(cleanEnv(input.env)), input.fingerprint, input.net],
    );
    const id = rows[0]!.id;
    return { id, ref: feedbackRef(id) };
  });
}

export type PublicFeedback = {
  id: string;
  kind: FeedbackKind;
  /** 가린 제보는 빈 문자열 */
  title: string;
  page_path: string;
  status: FeedbackStatus;
  public_note: string;
  duplicate_of: string | null;
  metoo_count: number;
  created_at: string;
  status_changed_at: string;
  my_metoo?: boolean;
};

const PUBLIC_COLS = `f.id::text, f.kind, CASE WHEN f.status = 'hidden' THEN '' ELSE f.title END AS title,
  CASE WHEN f.status = 'hidden' THEN '' ELSE f.page_path END AS page_path,
  f.status, f.public_note, f.duplicate_of::text, f.metoo_count, f.created_at, f.status_changed_at`;

export type FeedbackFilter = "open" | "closed" | "all";
export const PAGE_SIZE = 30;

/** 공개 현황판. 열린 제보는 "나도 겪었어요"가 많은 순, 나머지는 최근 상태가 바뀐 순 */
export async function listPublic(filter: FeedbackFilter, page = 1, fp: string | null = null): Promise<{ items: PublicFeedback[]; total: number }> {
  // 세 경우 모두 $1 을 쓰게 (쓰지 않는 인자를 보내면 Postgres 가 거절한다)
  const where = filter === "open" ? "f.status = ANY($1::text[])" : filter === "closed" ? "NOT (f.status = ANY($1::text[]))" : "$1::text[] IS NOT NULL";
  const order = filter === "open" ? "f.metoo_count DESC, f.created_at DESC" : "f.status_changed_at DESC, f.id DESC";
  const offset = (Math.max(1, Math.min(page, 100)) - 1) * PAGE_SIZE;
  const [items, total] = await Promise.all([
    query<PublicFeedback>(
      `SELECT ${PUBLIC_COLS}, EXISTS (SELECT 1 FROM feedback_votes v WHERE v.feedback_id = f.id AND v.voter_fingerprint = $2) AS my_metoo
         FROM feedback f WHERE ${where} ORDER BY ${order} LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
      [OPEN_STATUSES, fp],
    ),
    query<{ n: number }>(`SELECT count(*)::int AS n FROM feedback f WHERE ${where}`, [OPEN_STATUSES]),
  ]);
  return { items, total: total[0]!.n };
}

export type MyFeedback = PublicFeedback & { body: string; env: FeedbackEnv; real_title: string };

/** 증표를 확인한 내 제보 (자세한 내용 포함) */
export async function listMine(ids: string[]): Promise<MyFeedback[]> {
  if (!ids.length) return [];
  return query<MyFeedback>(
    `SELECT ${PUBLIC_COLS}, f.body, f.env, f.title AS real_title FROM feedback f WHERE f.id = ANY($1::bigint[]) ORDER BY f.id DESC`,
    [ids],
  );
}

/** "나도 겪었어요" — 같은 값을 다시 누르면 취소. 열린 제보만, 제보자(같은 망 포함)는 누를 수 없다. 같은 망은 한 사람으로 센다 */
export async function toggleMetoo(id: string, fp: string, net: string | null): Promise<{ metoo_count: number; my_metoo: boolean }> {
  if (!ID.test(id)) throw notFound("제보");
  return tx(async (client) => {
    const { rows } = await client.query<{ status: FeedbackStatus; reporter_fingerprint: string | null; reporter_net: string | null }>(
      "SELECT status, reporter_fingerprint, reporter_net FROM feedback WHERE id = $1 FOR UPDATE",
      [id],
    );
    const f = rows[0];
    if (!f || f.status === "hidden") throw notFound("제보");
    if (!OPEN_STATUSES.includes(f.status)) throw new HttpError(409, "feedback_closed", `이미 처리된 제보예요 (${FEEDBACK_STATUS[f.status]}).`);
    if (f.reporter_fingerprint === fp || (net && f.reporter_net === net)) throw new HttpError(403, "own_feedback", "내가 보낸 제보예요.");
    const del = await client.query("DELETE FROM feedback_votes WHERE feedback_id = $1 AND voter_fingerprint = $2", [id, fp]);
    const mine = !del.rowCount;
    if (mine) await client.query("INSERT INTO feedback_votes (feedback_id, voter_fingerprint, voter_net) VALUES ($1, $2, $3)", [id, fp, net]);
    return { metoo_count: await recount(client, id), my_metoo: mine };
  });
}

async function recount(client: PoolClient, id: string): Promise<number> {
  const { rows } = await client.query<{ n: number }>(
    `UPDATE feedback SET metoo_count = (SELECT count(DISTINCT coalesce(voter_net, voter_fingerprint)) FROM feedback_votes WHERE feedback_id = $1)
      WHERE id = $1 RETURNING metoo_count AS n`,
    [id],
  );
  return rows[0]!.n;
}

// ---------------------------------------------------------------------------
// 운영자 (/admin/feedback — ADMIN_PASSWORD 뒤)
// ---------------------------------------------------------------------------

export type AdminFeedback = MyFeedback & { resolved_at: string | null };

export async function listForAdmin(status: FeedbackStatus | "open" | "all" = "open", limit = 100): Promise<AdminFeedback[]> {
  const where = status === "open" ? "f.status = ANY($1::text[])" : status === "all" ? "$1::text IS NOT NULL" : "f.status = $1::text";
  return query<AdminFeedback>(
    `SELECT ${PUBLIC_COLS.replace("CASE WHEN f.status = 'hidden' THEN '' ELSE f.page_path END AS page_path", "f.page_path")}, f.body, f.env, f.title AS real_title, f.resolved_at
       FROM feedback f WHERE ${where}
      ORDER BY (f.status = 'new') DESC, f.metoo_count DESC, f.created_at DESC LIMIT ${Math.min(limit, 300)}`,
    [status === "open" ? OPEN_STATUSES : status],
  );
}

export async function countNew(): Promise<{ new: number; open: number }> {
  const rows = await query<{ new: number; open: number }>(
    "SELECT count(*) FILTER (WHERE status = 'new')::int AS new, count(*) FILTER (WHERE status = ANY($1::text[]))::int AS open FROM feedback",
    [OPEN_STATUSES],
  );
  return rows[0]!;
}

/**
 * 상태·공개 답변 바꾸기. "같은 제보 있음"이면 대상 번호가 필요하고, "나도 겪었어요" 표를 대상 제보로 옮긴다.
 * "가림"(광고·욕설·개인정보)은 사유를 공개 답변으로 적어야 한다 — 가렸다는 사실과 사유는 현황판에 남는다.
 */
export async function updateFeedback(id: string, input: { status: FeedbackStatus; note: string; duplicateOf?: string | null }): Promise<void> {
  if (!ID.test(id)) throw notFound("제보");
  const note = input.note.trim().slice(0, 500);
  if (input.status === "hidden" && !note) throw new HttpError(400, "note_required", "가리는 사유를 공개 답변으로 적어 주세요.");
  if (input.status === "wontfix" && !note) throw new HttpError(400, "note_required", "그대로 두는 이유를 공개 답변으로 적어 주세요.");
  await tx(async (client) => {
    const { rows } = await client.query<{ status: FeedbackStatus }>("SELECT status FROM feedback WHERE id = $1 FOR UPDATE", [id]);
    if (!rows[0]) throw notFound("제보");
    let dup: string | null = null;
    if (input.status === "duplicate") {
      if (!input.duplicateOf || !ID.test(input.duplicateOf) || input.duplicateOf === id) throw new HttpError(400, "invalid_duplicate", "같은 제보의 번호를 적어 주세요.");
      const target = await client.query<{ status: FeedbackStatus; duplicate_of: string | null }>(
        "SELECT status, duplicate_of::text FROM feedback WHERE id = $1 FOR UPDATE",
        [input.duplicateOf],
      );
      if (!target.rows[0] || target.rows[0].status === "hidden") throw new HttpError(400, "invalid_duplicate", "같은 제보로 적은 번호의 제보가 없습니다.");
      // 대상도 다른 제보의 중복이면 그 원래 제보로 (한 단계로 펴 둔다)
      dup = target.rows[0].status === "duplicate" && target.rows[0].duplicate_of ? target.rows[0].duplicate_of : input.duplicateOf;
      if (dup === id) throw new HttpError(400, "invalid_duplicate", "서로를 같은 제보로 묶을 수 없습니다.");
      await client.query(
        `INSERT INTO feedback_votes (feedback_id, voter_fingerprint, voter_net, created_at)
         SELECT $2::bigint, voter_fingerprint, voter_net, created_at FROM feedback_votes WHERE feedback_id = $1::bigint
         UNION ALL SELECT $2::bigint, reporter_fingerprint, reporter_net, created_at FROM feedback WHERE id = $1::bigint AND reporter_fingerprint IS NOT NULL
         ON CONFLICT DO NOTHING`,
        [id, dup],
      );
      await client.query("UPDATE feedback SET duplicate_of = $2 WHERE duplicate_of = $1", [id, dup]);
      await recount(client, dup);
    }
    const closed = !OPEN_STATUSES.includes(input.status);
    await client.query(
      `UPDATE feedback SET status = $2::varchar, public_note = $3, duplicate_of = $4,
              status_changed_at = CASE WHEN status <> $2::varchar THEN now() ELSE status_changed_at END,
              resolved_at = CASE WHEN $5 THEN coalesce(resolved_at, now()) ELSE NULL END
        WHERE id = $1`,
      [id, input.status, note, dup, closed],
    );
  });
}
