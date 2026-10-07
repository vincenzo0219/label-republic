/**
 * 운영자 승인 대기함 (Sprint 51).
 *
 * AI가 운영자 계정(덕후1호)의 글·답글과 스레드·인스타 문구 초안을 넣어 두면, 운영자가 /admin/drafts 에서
 * 고치고 [승인]을 눌러야 올라간다. 승인한 글은 운영자 본인의 글이다 — 🤖 표시가 붙지 않는 대신,
 * 운영자가 써 보지 않은 제품의 후기처럼 꾸민 초안은 만들지 않는다 (README Sprint 51).
 * 스레드·인스타는 아직 API 연결 전이라 [복사] 후 "올렸음"으로 표시만 한다.
 */
import { query, tx } from "../db";
import { HttpError, notFound } from "../errors";
import { createComment } from "./comments";
import { createPost } from "./posts";

export type DraftKind = "post" | "comment" | "threads" | "instagram";
export type DraftStatus = "pending" | "posted" | "copied" | "discarded";

export const DRAFT_KINDS: Record<DraftKind, string> = {
  post: "📝 노방장 글",
  comment: "💬 노방장 답글",
  threads: "🧵 스레드",
  instagram: "📷 인스타",
};

export type Draft = {
  id: string;
  kind: DraftKind;
  category_slug: string | null;
  post_id: string | null;
  parent_id: string | null;
  nickname: string;
  title: string;
  body: string;
  extra: string;
  note: string;
  status: DraftStatus;
  result_post_id: string | null;
  result_comment_id: string | null;
  created_at: string;
  decided_at: string | null;
  /** 답글이면 대상 글 제목 */
  post_title: string | null;
};

export type NewDraft = {
  kind: DraftKind;
  categorySlug?: string;
  postId?: string;
  parentId?: string;
  nickname?: string;
  pin?: string;
  title?: string;
  body: string;
  extra?: string;
  note?: string;
};

const COLS = `d.id, d.kind, d.category_slug, d.post_id, d.parent_id, d.nickname, d.title, d.body, d.extra, d.note, d.status,
  d.result_post_id, d.result_comment_id, d.created_at, d.decided_at, p.title AS post_title`;

export async function createDraft(input: NewDraft): Promise<Draft> {
  const needsPin = input.kind === "post" || input.kind === "comment";
  if (needsPin && !/^\d{4}$/.test(input.pin ?? "")) throw new HttpError(400, "invalid_input", "운영자 계정 비밀번호(4자리)가 필요합니다.");
  if (input.kind === "post" && !(input.categorySlug && input.title)) throw new HttpError(400, "invalid_input", "방과 제목이 필요합니다.");
  if (input.kind === "comment" && !input.postId) throw new HttpError(400, "invalid_input", "답글을 달 글 번호가 필요합니다.");
  const rows = await query<{ id: string }>(
    `INSERT INTO operator_drafts (kind, category_slug, post_id, parent_id, nickname, pin, title, body, extra, note)
     VALUES ($1, $2, $3, $4, coalesce($5, '덕후1호'), $6, $7, $8, $9, $10) RETURNING id`,
    [
      input.kind,
      input.categorySlug ?? null,
      input.postId ?? null,
      input.parentId ?? null,
      input.nickname ?? null,
      needsPin ? input.pin : null,
      input.title ?? "",
      input.body,
      input.extra ?? "",
      input.note ?? "",
    ],
  );
  return (await getDraft(rows[0]!.id))!;
}

export async function getDraft(id: string): Promise<Draft | null> {
  const rows = await query<Draft>(`SELECT ${COLS} FROM operator_drafts d LEFT JOIN posts p ON p.id = d.post_id WHERE d.id = $1`, [id]);
  return rows[0] ?? null;
}

/** 대기 중인 것 전부 + 최근 처리한 것 20개 */
export async function listDrafts(): Promise<{ pending: Draft[]; done: Draft[] }> {
  const [pending, done] = await Promise.all([
    query<Draft>(`SELECT ${COLS} FROM operator_drafts d LEFT JOIN posts p ON p.id = d.post_id WHERE d.status = 'pending' ORDER BY d.id`),
    query<Draft>(`SELECT ${COLS} FROM operator_drafts d LEFT JOIN posts p ON p.id = d.post_id WHERE d.status <> 'pending' ORDER BY d.decided_at DESC, d.id DESC LIMIT 20`),
  ]);
  return { pending, done };
}

export async function pendingDraftCount(): Promise<number> {
  const rows = await query<{ n: number }>("SELECT count(*)::int AS n FROM operator_drafts WHERE status = 'pending'");
  return rows[0]?.n ?? 0;
}

/** 대기 중인 초안을 잡아 둔다 — 두 번 눌러도 한 번만 올라가게 */
async function claim(id: string): Promise<Draft & { pin: string | null }> {
  return tx(async (client) => {
    const r = await client.query<Draft & { pin: string | null }>("SELECT * FROM operator_drafts WHERE id = $1 FOR UPDATE", [id]);
    const d = r.rows[0];
    if (!d) throw notFound();
    if (d.status !== "pending") throw new HttpError(409, "already_decided", "이미 처리한 초안입니다.");
    return d;
  });
}

/**
 * 승인: 노방장 글·답글은 운영자 계정으로 바로 올리고, 스레드·인스타는 "올렸음"으로 표시한다.
 * 고친 제목·본문이 오면 그걸 올린다.
 */
export async function approveDraft(id: string, edit: { title?: string; body?: string } = {}): Promise<Draft> {
  const d = await claim(id);
  const title = edit.title?.trim() || d.title;
  const body = edit.body?.trim() || d.body;
  let postId: string | null = null;
  let commentId: string | null = null;
  if (d.kind === "post") {
    const post = await createPost({ categorySlug: d.category_slug!, nickname: d.nickname, pin: d.pin!, title, body, summary: null, postType: "chat" });
    postId = post.id;
  } else if (d.kind === "comment") {
    const c = await createComment(d.post_id!, { nickname: d.nickname, pin: d.pin!, body, parentId: d.parent_id ?? undefined });
    postId = d.post_id;
    commentId = c.id;
  }
  // 조건부 갱신: 그 사이 다른 승인이 끝났으면 0행
  const updated = await query<{ id: string }>(
    `UPDATE operator_drafts SET status = $2, title = $3, body = $4, pin = NULL, decided_at = now(), result_post_id = $5, result_comment_id = $6
      WHERE id = $1 AND status = 'pending' RETURNING id`,
    [id, d.kind === "post" || d.kind === "comment" ? "posted" : "copied", title, body, postId, commentId],
  );
  if (!updated[0]) throw new HttpError(409, "already_decided", "이미 처리한 초안입니다.");
  return (await getDraft(id))!;
}

export async function discardDraft(id: string): Promise<void> {
  const r = await query<{ id: string }>(
    "UPDATE operator_drafts SET status = 'discarded', pin = NULL, decided_at = now() WHERE id = $1 AND status = 'pending' RETURNING id",
    [id],
  );
  if (!r[0]) {
    if (!(await getDraft(id))) throw notFound();
    throw new HttpError(409, "already_decided", "이미 처리한 초안입니다.");
  }
}
