import type { PoolClient } from "pg";
import { query, tx, isUniqueViolation } from "../db";
import { PAGE_SIZE } from "../config";
import { HttpError, blinded, notFound, tooMany } from "../errors";
import { hashPin } from "../password";
import { hit } from "../rate-limit";
import { aiSpam, combine, heuristicSpam, moderationNote, shouldSuppress, type SpamVerdict } from "../moderation";
import { searchTerms } from "../highlight";
import { generateSummary, type ResolvedSummary } from "../summary";
import type { SortKey } from "../validation";
import type { PostCard, PostDetail } from "../types";
import { assertPin } from "./pin-guard";

const CARD_SELECT = `
  p.id, p.nickname, p.title, p.upvotes, p.downvotes, p.comment_count,
  p.trust_tier, p.is_ai_curated, p.is_suppressed, p.created_at,
  json_build_object('slug', c.slug, 'name', c.name) AS category,
  left(regexp_replace(p.body, '\\s+', ' ', 'g'), 400) AS excerpt,
  CASE WHEN s.id IS NULL THEN NULL ELSE json_build_object(
    'lines', s.summary_lines, 'model_version', s.model_version, 'is_author_edited', s.is_author_edited
  ) END AS summary`;

const FROM = `
  FROM posts p
  JOIN categories c ON c.id = p.category_id
  LEFT JOIN ai_summaries s ON s.id = p.ai_summary_id`;

// 스팸 의심(is_suppressed) 글은 모든 정렬에서 맨 뒤로 보낸다 (AI 1차 정화 — 노출 순위 하향)
const ORDER: Record<SortKey, string> = {
  // enum 순서: pending < none < top19 < top12 < top5
  trust: "p.is_suppressed, p.trust_tier DESC, (p.upvotes - p.downvotes) DESC, p.created_at DESC, p.id DESC",
  latest: "p.is_suppressed, p.created_at DESC, p.id DESC",
  votes: "p.is_suppressed, (p.upvotes - p.downvotes) DESC, p.upvotes DESC, p.created_at DESC, p.id DESC",
};

function escapeLike(term: string) {
  return term.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export type ListParams = { categoryId?: number; sort: SortKey; q?: string; page?: number; pageSize?: number };

export async function listPosts(params: ListParams): Promise<{ items: PostCard[]; total: number; page: number; pageSize: number }> {
  const where: string[] = ["NOT p.is_blinded"];
  const args: unknown[] = [];
  if (params.categoryId) {
    args.push(params.categoryId);
    where.push(`p.category_id = $${args.length}`);
  }
  // 검색: 공백 구분 검색어가 모두 제목 또는 본문에 포함 (AND). pg_trgm GIN 인덱스가 ILIKE를 가속한다.
  for (const term of searchTerms(params.q ?? "")) {
    args.push(`%${escapeLike(term)}%`);
    where.push(`(p.title ILIKE $${args.length} OR p.body ILIKE $${args.length})`);
  }
  const pageSize = Math.min(params.pageSize ?? PAGE_SIZE, 50);
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const whereSql = where.join(" AND ");

  const [items, count] = await Promise.all([
    query<PostCard>(
      `SELECT ${CARD_SELECT} ${FROM} WHERE ${whereSql} ORDER BY ${ORDER[params.sort]}
       LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
      [...args, pageSize, (page - 1) * pageSize],
    ),
    query<{ total: number }>(`SELECT count(*)::int AS total FROM posts p WHERE ${whereSql}`, args),
  ]);
  return { items, total: count[0]!.total, page, pageSize };
}

type PostRow = PostDetail & { pw_hash: string; category_id: number };

async function loadPost(id: string, client?: PoolClient, forUpdate = false): Promise<PostRow | null> {
  if (!/^\d{1,18}$/.test(id)) return null;
  const sql = `SELECT ${CARD_SELECT}, p.body, p.report_count, p.is_blinded, p.updated_at, p.moderation_note, p.pw_hash, p.category_id
    ${FROM} WHERE p.id = $1 ${forUpdate ? "FOR UPDATE OF p" : ""}`;
  const rows = client ? (await client.query<PostRow>(sql, [id])).rows : await query<PostRow>(sql, [id]);
  return rows[0] ?? null;
}

function publicPost({ pw_hash: _pw, category_id: _c, ...rest }: PostRow): PostDetail {
  if (rest.is_blinded) {
    // 블라인드 글은 본문/요약을 노출하지 않는다.
    return { ...rest, body: "", excerpt: "", summary: null };
  }
  return rest;
}

export async function getPost(id: string): Promise<PostDetail | null> {
  const row = await loadPost(id);
  return row ? publicPost(row) : null;
}

async function insertSummary(client: PoolClient, postId: string, s: ResolvedSummary) {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO ai_summaries (post_id, summary_lines, model_version, is_author_edited)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [postId, s.lines, s.model, s.isAuthorEdited],
  );
  await client.query("UPDATE posts SET ai_summary_id = $1 WHERE id = $2", [rows[0]!.id, postId]);
}

export type CreatePostInput = {
  categorySlug: string;
  nickname: string;
  pin: string;
  title: string;
  body: string;
  summary: ResolvedSummary | null;
};

export async function createPost(input: CreatePostInput): Promise<PostDetail> {
  const summary: ResolvedSummary =
    input.summary ?? { ...(await generateSummary(input.title, input.body)), isAuthorEdited: false };
  const pwHash = await hashPin(input.pin);
  const spam = heuristicSpam(input.title, input.body);

  const id = await tx(async (client) => {
    const cat = await client.query<{ id: number }>("SELECT id FROM categories WHERE slug = $1", [input.categorySlug]);
    if (!cat.rows[0]) throw new HttpError(400, "invalid_category", "존재하지 않는 카테고리입니다.");
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO posts (category_id, nickname, pw_hash, title, body, spam_score, is_suppressed, moderation_note, moderated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [cat.rows[0].id, input.nickname, pwHash, input.title, input.body, ...moderationParams(spam)],
    );
    await insertSummary(client, rows[0]!.id, summary);
    return rows[0]!.id;
  });
  return (await getPost(id))!;
}

export type UpdatePostInput = { title?: string; body?: string; summary?: ResolvedSummary | null };

export async function updatePost(id: string, fp: string, pin: string, input: UpdatePostInput): Promise<PostDetail> {
  await tx(async (client) => {
    const post = await loadPost(id, client, true);
    if (!post) throw notFound();
    if (post.is_blinded) throw blinded();
    await assertPin(`post:${id}`, fp, pin, post.pw_hash);
    const title = input.title ?? post.title;
    const body = input.body ?? post.body;
    await client.query(
      `UPDATE posts SET title = $2, body = $3, updated_at = now(),
         spam_score = $4, is_suppressed = $5, moderation_note = $6, moderated_by = $7
       WHERE id = $1`,
      [id, title, body, ...moderationParams(heuristicSpam(title, body))],
    );
    if (input.summary) await insertSummary(client, id, input.summary);
  });
  return (await getPost(id))!;
}

export async function deletePost(id: string, fp: string, pin: string): Promise<void> {
  await tx(async (client) => {
    const post = await loadPost(id, client, true);
    if (!post) throw notFound();
    await assertPin(`post:${id}`, fp, pin, post.pw_hash);
    await client.query("DELETE FROM posts WHERE id = $1", [id]);
  });
}

/** 기존 글의 요약 교체 (작성자 수정본 또는 AI 재생성) */
export async function replaceSummary(
  id: string,
  fp: string,
  pin: string,
  lines: ResolvedSummary["lines"] | undefined,
): Promise<PostDetail> {
  const post = await loadPost(id);
  if (!post) throw notFound();
  if (post.is_blinded) throw blinded();
  await assertPin(`post:${id}`, fp, pin, post.pw_hash);
  let summary: ResolvedSummary;
  if (lines) {
    summary = { lines, model: "author", isAuthorEdited: true };
  } else {
    if (!hit(`summary:${fp}`, 10, 60_000)) throw tooMany();
    summary = { ...(await generateSummary(post.title, post.body)), isAuthorEdited: false };
  }
  await tx((client) => insertSummary(client, id, summary));
  return (await getPost(id))!;
}

// ---------------------------------------------------------------------------
// AI 1차 정화
// ---------------------------------------------------------------------------

function moderationParams(v: SpamVerdict): [number, boolean, string, string] {
  return [v.score, shouldSuppress(v), moderationNote(v), v.model];
}

/**
 * 게시 직후 비동기로 호출: Claude 분류로 규칙 기반 점수를 보정한다.
 * API 키가 없거나 호출이 실패하면 규칙 기반 판정을 그대로 둔다.
 * 판정 중 글이 수정됐으면(updated_at 변경) 덮어쓰지 않는다. JS Date는 밀리초 정밀도라 DB 값도 밀리초로 잘라 비교한다.
 */
export async function aiModeratePost(id: string): Promise<SpamVerdict | null> {
  const post = await loadPost(id);
  if (!post || post.is_blinded) return null;
  const ai = await aiSpam(post.title, post.body);
  if (!ai) return null;
  const verdict = combine(heuristicSpam(post.title, post.body), ai);
  await query(
    `UPDATE posts SET spam_score = $2, is_suppressed = $3, moderation_note = $4, moderated_by = $5
     WHERE id = $1 AND date_trunc('milliseconds', updated_at) = $6::timestamptz`,
    [id, ...moderationParams(verdict), post.updated_at],
  );
  return verdict;
}

// ---------------------------------------------------------------------------
// 추천/비추천 — fingerprint당 1표. 같은 값을 다시 누르면 취소, 반대 값이면 변경.
// ---------------------------------------------------------------------------

export type VoteResult = { upvotes: number; downvotes: number; myVote: 1 | -1 | 0; trust_tier: string };

export async function votePost(id: string, fp: string, value: 1 | -1): Promise<VoteResult> {
  return tx(async (client) => {
    const post = await loadPost(id, client, true);
    if (!post) throw notFound();
    if (post.is_blinded) throw blinded();

    const existing = await client.query<{ value: number }>(
      "SELECT value FROM votes WHERE post_id = $1 AND voter_fingerprint = $2",
      [id, fp],
    );
    let myVote: 1 | -1 | 0 = value;
    if (!existing.rows[0]) {
      await client.query("INSERT INTO votes (post_id, voter_fingerprint, value) VALUES ($1, $2, $3)", [id, fp, value]);
    } else if (existing.rows[0].value === value) {
      await client.query("DELETE FROM votes WHERE post_id = $1 AND voter_fingerprint = $2", [id, fp]);
      myVote = 0;
    } else {
      await client.query("UPDATE votes SET value = $3, created_at = now() WHERE post_id = $1 AND voter_fingerprint = $2", [id, fp, value]);
    }
    // 신뢰도 배지는 투표마다 재계산하지 않고 배치(src/lib/jobs/trust.ts)가 주기적으로 갱신한다.
    // 투표 경로에서 카테고리 전체를 UPDATE 하면 같은 카테고리 동시 투표끼리 잠금 경합·교착이 생긴다.
    const { rows } = await client.query<{ upvotes: number; downvotes: number; trust_tier: string }>(
      "SELECT upvotes, downvotes, trust_tier FROM posts WHERE id = $1",
      [id],
    );
    return { ...rows[0]!, myVote };
  });
}

export async function getMyVote(id: string, fp: string): Promise<1 | -1 | 0> {
  if (!/^\d{1,18}$/.test(id)) return 0;
  const rows = await query<{ value: number }>("SELECT value FROM votes WHERE post_id = $1 AND voter_fingerprint = $2", [id, fp]);
  return (rows[0]?.value ?? 0) as 1 | -1 | 0;
}

// ---------------------------------------------------------------------------
// 신고 — fingerprint당 1회, 고유 신고 5건이면 DB 트리거가 자동 블라인드
// ---------------------------------------------------------------------------

export type ReportResult = { report_count: number; is_blinded: boolean; alreadyReported: boolean };

export async function reportPost(id: string, fp: string, reason: string): Promise<ReportResult> {
  const post = await loadPost(id);
  if (!post) throw notFound();
  // 한 클라이언트가 짧은 시간에 대량 신고하는 것을 1차 차단 (정교한 가중치 하향은 Sprint 4)
  if (!hit(`report:${fp}`, 20, 60 * 60 * 1000)) throw tooMany();
  let alreadyReported = false;
  try {
    await query("INSERT INTO reports (post_id, reporter_fingerprint, reason) VALUES ($1, $2, $3)", [id, fp, reason]);
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    alreadyReported = true;
  }
  const rows = await query<{ report_count: number; is_blinded: boolean }>(
    "SELECT report_count, is_blinded FROM posts WHERE id = $1",
    [id],
  );
  return { ...rows[0]!, alreadyReported };
}

/** sitemap 용 */
export async function listPostIdsForSitemap(limit = 5000): Promise<{ id: string; updated_at: string }[]> {
  return query(`SELECT id, updated_at FROM posts WHERE NOT is_blinded AND NOT is_suppressed ORDER BY id DESC LIMIT $1`, [limit]);
}
