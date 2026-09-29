import type { PoolClient } from "pg";
import { isQueryCanceled, isUniqueViolation, query, queryWithTimeout, tx } from "../db";
import { PAGE_SIZE } from "../config";
import { HttpError, blinded, notFound, tooMany } from "../errors";
import { hashPin } from "../password";
import { hit } from "../rate-limit";
import { aiSpam, combine, heuristicSpam, moderationNote, shouldSuppress, type SpamVerdict } from "../moderation";
import { searchTerms } from "../highlight";
import { generateSummary, type ResolvedSummary } from "../summary";
import type { SortKey } from "../validation";
import type { PostCard, PostDetail, PostRevision, PostType } from "../types";
import { assertCanPropose, insertMeetup, type MeetupInput } from "./meetups";
import { deleteFiles, listPostImages, setPostImages, type ImageRef } from "./images";
import { assertPin } from "./pin-guard";
import { listPostSources, setPostSources, type SourceRef } from "./sources";
import { getRule } from "./rules";
import { deleteSnapshot } from "../snapshots";
import { currentProductIds, listPostFacts, listPostProductDates, setPostFacts, setPostProducts, type FactInput, type ProductRef } from "./products";

const CARD_SELECT = `
  p.id, p.nickname, p.title, p.upvotes, p.downvotes, p.comment_count,
  p.trust_tier, p.is_ai_curated, p.is_suppressed, p.post_type, p.created_at,
  CASE WHEN mt.post_id IS NULL THEN NULL ELSE json_build_object(
    'meet_at', mt.meet_at, 'location', mt.location, 'min_participants', mt.min_participants,
    'capacity', mt.capacity, 'rsvp_count', mt.rsvp_count, 'status', mt.status, 'confirmed_at', mt.confirmed_at
  ) END AS meetup,
  json_build_object('slug', c.slug, 'name', c.name) AS category,
  left(regexp_replace(p.body, '\\s+', ' ', 'g'), 400) AS excerpt,
  CASE WHEN s.id IS NULL THEN NULL ELSE json_build_object(
    'lines', s.summary_lines, 'model_version', s.model_version, 'is_author_edited', s.is_author_edited
  ) END AS summary,
  (SELECT i.id FROM post_images i WHERE i.post_id = p.id ORDER BY i.position LIMIT 1) AS thumb_id,
  (SELECT count(*)::int FROM post_images i WHERE i.post_id = p.id) AS image_count,
  p.source_count::int AS source_count,
  CASE WHEN p.source_count = 0 THEN '{}'::text[]
       ELSE (SELECT array_agg(DISTINCT ps.kind::text) FROM post_sources ps WHERE ps.post_id = p.id) END AS source_kinds,
  coalesce((SELECT json_agg(json_build_object('id', pr.id::text, 'brand', pr.brand, 'name', pr.name) ORDER BY pp.position)
              FROM post_products pp JOIN products pr ON pr.id = pp.product_id WHERE pp.post_id = p.id), '[]'::json) AS products,
  p.correction_count, p.disputed_count`;

const FROM = `
  FROM posts p
  JOIN categories c ON c.id = p.category_id
  LEFT JOIN ai_summaries s ON s.id = p.ai_summary_id
  LEFT JOIN meetups mt ON mt.post_id = p.id`;

// 스팸 의심(is_suppressed) 글은 모든 정렬에서 맨 뒤로 보낸다 (AI 1차 정화 — 노출 순위 하향)
// 신뢰도순에서는 [잡담] 글을 정보 글 아래로 내린다 (정보 오염 방지). 최신순·추천순은 유형과 무관.
const ORDER: Record<SortKey, string> = {
  // enum 순서: pending < none < top19 < top12 < top5
  // 정모는 배지 대상이 아니지만(none), 정렬에서는 "검증 대기" 정보 글과 같은 자리로 취급해 피드 상단을 독점하지 않게 한다.
  trust: "p.is_suppressed, (p.post_type = 'chat'), CASE WHEN p.post_type = 'meetup' THEN 'pending'::trust_tier ELSE p.trust_tier END DESC, (p.upvotes - p.downvotes) DESC, p.created_at DESC, p.id DESC",
  latest: "p.is_suppressed, p.created_at DESC, p.id DESC",
  votes: "p.is_suppressed, (p.upvotes - p.downvotes) DESC, p.upvotes DESC, p.created_at DESC, p.id DESC",
};

function escapeLike(term: string) {
  return term.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export type ListParams = {
  categoryId?: number;
  sort: SortKey;
  q?: string;
  page?: number;
  pageSize?: number;
  type?: PostType;
  /** 출처가 달린 글만 */
  sourced?: boolean;
  /** 이 제품을 태그한 글만 */
  productId?: string;
  /** 이 시각 이후에 쓴 글만 */
  since?: Date;
  /** 이 fingerprint 가 쓴 글은 빼고 (관심 제품 새 글 미리보기에서 내 글 제외) */
  excludeAuthor?: string | null;
  /** 전체 개수를 세지 않는다 (미리보기용 — total 은 가져온 개수) */
  noCount?: boolean;
};

/** 이보다 깊은 페이지는 조회하지 않는다 (OFFSET 비용·크롤러 방어). 오래된 글은 검색·사이트맵으로 찾는다. */
export const MAX_PAGE = 500;
/**
 * 전체 글의 1% 이상에 들어 있는 두 글자 조각은 bigram 인덱스로 좁혀도 이득이 없다.
 * 이런 흔한 검색어는 정렬 인덱스를 따라가며 ILIKE 로 거르는 편이 빠르므로 bigram 조건을 붙이지 않는다.
 * (조건을 붙이면 플래너가 정렬 인덱스를 고르더라도 lr_bigrams 를 행마다 계산해 수백 ms가 든다)
 */
const COMMON_BIGRAM_FREQ = 0.01;
const BIGRAM_STATS_TTL_MS = 10 * 60_000;
let bigramStats: { at: number; common: Set<string> } | null = null;

/** ANALYZE 가 모은 bigram 인덱스 통계(most_common_elems)에서 흔한 조각 목록 */
async function commonBigrams(): Promise<Set<string>> {
  if (bigramStats && Date.now() - bigramStats.at < BIGRAM_STATS_TTL_MS) return bigramStats.common;
  const common = new Set<string>();
  try {
    const rows = await query<{ elems: string[] | null; freqs: number[] | null }>(
      `SELECT most_common_elems::text::text[] AS elems, most_common_elem_freqs AS freqs
         FROM pg_stats WHERE schemaname = current_schema() AND tablename = 'posts_bigram_idx'`,
    );
    const { elems, freqs } = rows[0] ?? { elems: null, freqs: null };
    elems?.forEach((e, i) => {
      if ((freqs?.[i] ?? 0) >= COMMON_BIGRAM_FREQ) common.add(e);
    });
  } catch {
    // 통계를 못 읽으면 항상 bigram 조건을 쓴다 (정확성에는 영향 없음)
  }
  bigramStats = { at: Date.now(), common };
  return common;
}

/** 검색 쿼리 실행 시간 상한 — 넘으면 503 (한 요청이 DB를 오래 붙잡지 못하게) */
export const SEARCH_TIMEOUT_MS = 3000;

/**
 * 정렬·페이지 자르기는 posts 의 좁은 컬럼만으로 먼저 하고(정렬 인덱스를 그대로 탄다),
 * 본문 발췌·요약·보드·정모 JOIN 은 잘라낸 20건에만 한다.
 * 한 번에 하면 모든 후보 글의 본문에 regexp_replace 를 돌린 뒤 정렬해 글이 많을수록 느려진다.
 */
function pagedCardsSql(whereSql: string, orderSql: string, limitParam: string, offsetParam = "0", extraSelect = "") {
  return `WITH page AS MATERIALIZED (
      SELECT p.id, row_number() OVER (ORDER BY ${orderSql}) AS rn
        FROM posts p WHERE ${whereSql} ORDER BY ${orderSql} LIMIT ${limitParam} OFFSET ${offsetParam}
    )
    SELECT ${CARD_SELECT}${extraSelect} FROM page JOIN posts p ON p.id = page.id
      JOIN categories c ON c.id = p.category_id
      LEFT JOIN ai_summaries s ON s.id = p.ai_summary_id
      LEFT JOIN meetups mt ON mt.post_id = p.id
    ORDER BY page.rn`;
}

// 목록 개수가 크면 페이지마다 세지 않고 잠깐 캐시한다 (보드 20만 건이면 count 한 번에 수십 ms).
// 인스턴스별 캐시라 몇 초 늦게 반영될 수 있지만 "N개의 글" 표시에는 충분하다.
// 작은 개수는 세는 비용이 거의 없고 새 글이 바로 보여야 하므로 캐시하지 않는다.
const COUNT_TTL_MS = 15_000;
const COUNT_CACHE_MIN = 1000;
const countCache = new Map<string, { value: number; at: number }>();

async function cachedCount(sql: string, args: unknown[]): Promise<number> {
  const key = sql + JSON.stringify(args);
  const hitC = countCache.get(key);
  if (hitC && Date.now() - hitC.at < COUNT_TTL_MS) return hitC.value;
  const rows = await query<{ total: number }>(sql, args);
  const value = rows[0]!.total;
  if (value >= COUNT_CACHE_MIN) {
    if (countCache.size > 500) countCache.clear();
    countCache.set(key, { value, at: Date.now() });
  } else countCache.delete(key);
  return value;
}

export async function listPosts(
  params: ListParams,
): Promise<{ items: PostCard[]; total: number; totalCapped: boolean; tooShort?: boolean; page: number; pageSize: number }> {
  const where: string[] = ["NOT p.is_blinded"];
  const args: unknown[] = [];
  if (params.categoryId) {
    args.push(params.categoryId);
    where.push(`p.category_id = $${args.length}`);
  }
  if (params.type) {
    args.push(params.type);
    where.push(`p.post_type = $${args.length}::post_type`);
  }
  if (params.sourced) where.push("p.source_count > 0");
  if (params.productId) {
    args.push(params.productId);
    where.push(`EXISTS (SELECT 1 FROM post_products pp WHERE pp.post_id = p.id AND pp.product_id = $${args.length})`);
  }
  if (params.since) {
    args.push(params.since.toISOString());
    where.push(`p.created_at > $${args.length}::timestamptz`);
  }
  if (params.excludeAuthor) {
    args.push(params.excludeAuthor);
    where.push(`p.author_fingerprint IS DISTINCT FROM $${args.length}`);
  }
  const pageSize = Math.min(params.pageSize ?? PAGE_SIZE, 50);
  const page = Math.max(1, Math.floor(params.page ?? 1));

  // 검색: 공백 구분 검색어가 모두 제목 또는 본문에 포함 (AND).
  // 세 글자 이상은 pg_trgm GIN 인덱스가, 두 글자는 lr_bigrams GIN 인덱스(010 마이그레이션)가 후보를 좁힌다.
  // 한 글자 검색어는 인덱스로 좁힐 수 없어 다른 검색어의 추가 조건으로만 쓴다.
  const terms = searchTerms(params.q ?? "");
  if (terms.length && terms.every((t) => [...t].length < 2)) {
    return { items: [], total: 0, totalCapped: false, tooShort: true, page, pageSize };
  }
  const common = terms.some((t) => [...t].length === 2) ? await commonBigrams() : new Set<string>();
  for (const term of terms) {
    args.push(`%${escapeLike(term)}%`);
    where.push(`(p.title ILIKE $${args.length} OR p.body ILIKE $${args.length})`);
    if ([...term].length === 2 && !common.has(term.toLowerCase())) {
      args.push(term);
      where.push(`lr_bigrams(p.title || ' ' || p.body) @> ARRAY[lower($${args.length})]`);
    }
  }
  const whereSql = where.join(" AND ");
  const pageSql = pagedCardsSql(whereSql, ORDER[params.sort], `$${args.length + 1}`, `$${args.length + 2}`);
  const pageArgs = [...args, pageSize, (page - 1) * pageSize];

  if (terms.length) {
    // 검색은 전체 개수를 세지 않는다: 흔한 검색어는 일치하는 글을 끝까지 훑어야 해서 결과 20건보다 몇십 배 비싸다.
    // 한 건 더 가져와서 다음 페이지가 있는지만 판단한다 (total 은 "지금까지 본 개수", totalCapped 면 "N+개").
    if (page > MAX_PAGE) return { items: [], total: 0, totalCapped: false, page, pageSize };
    let rows: PostCard[];
    try {
      rows = await queryWithTimeout<PostCard>(SEARCH_TIMEOUT_MS, pageSql, [...args, pageSize + 1, (page - 1) * pageSize], { noParallel: true });
    } catch (err) {
      if (isQueryCanceled(err)) throw new HttpError(503, "search_timeout", "검색이 너무 오래 걸립니다. 검색어를 더 구체적으로 입력해주세요.");
      throw err;
    }
    const hasMore = rows.length > pageSize;
    const items = rows.slice(0, pageSize);
    return { items, total: (page - 1) * pageSize + items.length, totalCapped: hasMore, page, pageSize };
  }

  const [items, total] = await Promise.all([
    page > MAX_PAGE ? Promise.resolve([] as PostCard[]) : query<PostCard>(pageSql, pageArgs),
    params.noCount ? Promise.resolve(-1) : cachedCount(`SELECT count(*)::int AS total FROM posts p WHERE ${whereSql}`, args),
  ]);
  return { items, total: total < 0 ? items.length : total, totalCapped: false, page, pageSize };
}

/**
 * 개인화 리포트용: 선택한 보드들의 since 이후 새 [정보]·[정모] 글 (잡담·블라인드·광고 의심 제외), 신뢰도순.
 * total 은 limit 과 무관한 전체 개수.
 */
export async function listNewPosts(categoryIds: number[], since: Date, limit = 30): Promise<{ items: PostCard[]; total: number }> {
  if (!categoryIds.length) return { items: [], total: 0 };
  const where = `NOT p.is_blinded AND NOT p.is_suppressed AND p.post_type <> 'chat'
    AND p.category_id = ANY($1::int[]) AND p.created_at > $2::timestamptz`;
  const [items, count] = await Promise.all([
    query<PostCard>(pagedCardsSql(where, ORDER.trust, "$3"), [categoryIds, since.toISOString(), limit]),
    query<{ total: number }>(`SELECT count(*)::int AS total FROM posts p WHERE ${where}`, [categoryIds, since.toISOString()]),
  ]);
  return { items, total: count[0]!.total };
}

/** RSS/Atom 피드용: 최신 [정보]·[정모] 글 (잡담·블라인드·광고 의심 제외) */
export async function listFeedPosts(categoryId?: number, limit = 30): Promise<(PostCard & { updated_at: string })[]> {
  const where = `NOT p.is_blinded AND NOT p.is_suppressed AND p.post_type <> 'chat' ${categoryId ? "AND p.category_id = $2" : ""}`;
  return query(pagedCardsSql(where, "p.created_at DESC, p.id DESC", "$1", "0", ", p.updated_at"), categoryId ? [limit, categoryId] : [limit]);
}

/** 선택한 보드들의 다가오는 정모 (확정·모집 중) */
export async function listUpcomingMeetups(categoryIds: number[], now = new Date(), limit = 10): Promise<PostCard[]> {
  if (!categoryIds.length) return [];
  return query<PostCard>(
    `SELECT ${CARD_SELECT} ${FROM}
      WHERE NOT p.is_blinded AND NOT p.is_suppressed AND p.category_id = ANY($1::int[])
        AND mt.post_id IS NOT NULL AND mt.status <> 'expired' AND mt.meet_at > $2::timestamptz
      ORDER BY mt.meet_at LIMIT $3`,
    [categoryIds, now.toISOString(), limit],
  );
}

type PostRow = Omit<PostDetail, "images" | "sources" | "facts"> & { pw_hash: string; category_id: number };

async function loadPost(id: string, client?: PoolClient, forUpdate = false): Promise<PostRow | null> {
  if (!/^\d{1,18}$/.test(id)) return null;
  const sql = `SELECT ${CARD_SELECT}, p.body, p.report_count, p.is_blinded, p.updated_at, p.moderation_note, p.legal_hold, p.legal_hold_reason, p.pw_hash, p.category_id, p.revision_count, p.ai_reviewed
    ${FROM} WHERE p.id = $1 ${forUpdate ? "FOR UPDATE OF p" : ""}`;
  const rows = client ? (await client.query<PostRow>(sql, [id])).rows : await query<PostRow>(sql, [id]);
  return rows[0] ?? null;
}

function publicPost(
  { pw_hash: _pw, category_id: _c, ...rest }: PostRow,
  images: PostDetail["images"],
  sources: PostDetail["sources"],
  facts: PostDetail["facts"],
  productDates: PostDetail["product_dates"] = [],
): PostDetail {
  if (rest.is_blinded) {
    // 블라인드 글은 본문/요약/이미지/출처/제품을 노출하지 않는다.
    // 제목도 가린다 (블라인드 화면은 "블라인드된 게시글"로만 보여주는데 API 로는 제목이 나가던 것을 막음)
    return {
      ...rest, title: "", body: "", excerpt: "", summary: null, images: [], thumb_id: null, image_count: 0,
      sources: [], source_count: 0, source_kinds: [], products: [], facts: [], product_dates: [], correction_count: 0, disputed_count: 0,
    };
  }
  return { ...rest, images, sources, facts, product_dates: productDates };
}

export async function getPost(id: string): Promise<PostDetail | null> {
  const [row, images, sources, facts, dates] = await Promise.all([
    loadPost(id), listPostImages(id), listPostSources(id), listPostFacts(id), listPostProductDates(id),
  ]);
  return row ? publicPost(row, images, sources, facts, dates) : null;
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
  /** 작성자 fingerprint — 어뷰징 탐지의 "갓 생긴 fingerprint" 판별에만 쓰인다 */
  fingerprint?: string;
  /** 접속 망 대역 변환값 (networkHash, Sprint 29) — 리뉴얼 판단에서 같은 망의 글을 한 사람으로 센다 */
  network?: string;
  /** 같은 망 안에서 사람을 좁히는 값 (쓰기 제한, Sprint 37) */
  agent?: string;
  /** [정보]/[잡담]/[정모] — 기본 정보 */
  postType?: PostType;
  /** postType = meetup 일 때 필수 */
  meetup?: MeetupInput;
  /** 업로드한 이미지 (POST /api/uploads 가 준 id·token) */
  images?: ImageRef[];
  /** 출처 링크 */
  sources?: SourceRef[];
  /** 제품 태그 (최대 3개) */
  products?: ProductRef[];
  /** 제품 수치 — product 는 products 의 순서 */
  facts?: FactInput[];
};

export async function createPost(input: CreatePostInput): Promise<PostDetail> {
  const postType: PostType = input.postType ?? "info";
  if (postType === "meetup" && !input.meetup) throw new HttpError(400, "invalid_input", "정모 일시·장소·인원을 입력해주세요.");
  const summary: ResolvedSummary =
    input.summary ?? { ...(await generateSummary(input.title, input.body)), isAuthorEdited: false };
  const pwHash = await hashPin(input.pin);
  const spam = heuristicSpam(input.title, input.body);
  const spamCut = await getRule("spam_suppress_score");

  const id = await tx(async (client) => {
    const cat = await client.query<{ id: number }>("SELECT id FROM categories WHERE slug = $1", [input.categorySlug]);
    if (!cat.rows[0]) throw new HttpError(400, "invalid_category", "존재하지 않는 카테고리입니다.");
    if (postType === "meetup") await assertCanPropose(client, cat.rows[0].id, input.nickname, input.fingerprint);
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO posts (category_id, nickname, pw_hash, title, body, spam_score, is_suppressed, moderation_note, moderated_by,
                          author_fingerprint, post_type, trust_tier, author_net, author_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
      [
        cat.rows[0].id,
        input.nickname,
        pwHash,
        input.title,
        input.body,
        ...moderationParams(spam, spamCut),
        input.fingerprint ?? null,
        postType,
        // 잡담·정모 글은 신뢰도 배지 대상이 아니므로 "검증 대기" 대신 배지 없음으로 시작
        postType === "info" ? "pending" : "none",
        input.network ?? null,
        input.agent ?? null,
      ],
    );
    await insertSummary(client, rows[0]!.id, summary);
    if (input.images?.length) await setPostImages(client, rows[0]!.id, input.images);
    if (input.sources?.length) await setPostSources(client, rows[0]!.id, input.sources);
    if (input.products?.length) {
      const productIds = await setPostProducts(client, rows[0]!.id, cat.rows[0].id, input.products, input.fingerprint);
      if (input.facts?.length) await setPostFacts(client, rows[0]!.id, productIds, input.facts);
    } else if (input.facts?.length) {
      throw new HttpError(400, "invalid_product", "수치를 적으려면 먼저 제품을 태그해주세요.");
    }
    if (postType === "meetup") {
      await insertMeetup(client, rows[0]!.id, input.meetup!, { nickname: input.nickname, fingerprint: input.fingerprint });
    }
    return rows[0]!.id;
  });
  return (await getPost(id))!;
}

/** images 가 있으면 그 목록이 최종 상태(순서·대체 텍스트 포함), 없으면 이미지는 그대로 */
export type UpdatePostInput = {
  title?: string;
  body?: string;
  summary?: ResolvedSummary | null;
  images?: ImageRef[];
  /** 있으면 그 목록이 최종 상태, 없으면 출처는 그대로 */
  sources?: SourceRef[];
  /** 있으면 최종 상태 (빠진 제품의 수치도 지워진다) */
  products?: ProductRef[];
  /** 있으면 최종 상태. product 는 products(없으면 현재 태그)의 순서 */
  facts?: FactInput[];
};

export async function updatePost(id: string, fp: string, pin: string, input: UpdatePostInput): Promise<PostDetail> {
  const removed = await tx(async (client) => {
    const post = await loadPost(id, client, true);
    if (!post) throw notFound();
    if (post.is_blinded) throw blinded();
    await assertPin(`post:${id}`, fp, pin, post.pw_hash);
    const title = input.title ?? post.title;
    const body = input.body ?? post.body;
    // 수정 이력: 제목·본문·수치가 바뀌면 바뀌기 전 판을 남긴다 (정정 제안이 어떻게 반영됐는지 누구나 확인)
    const oldFacts = await client.query<{ facts: unknown }>(
      `SELECT coalesce(json_agg(json_build_object(
                'product_id', f.product_id::text, 'product', pr.brand || ' ' || pr.name, 'attribute', f.attribute,
                'value', f.value::float8, 'unit', f.unit, 'basis', f.basis, 'kind', f.kind) ORDER BY f.position), '[]'::json) AS facts
         FROM product_facts f JOIN products pr ON pr.id = f.product_id WHERE f.post_id = $1`,
      [id],
    );
    const factsChanged = input.facts !== undefined || input.products !== undefined;
    if (title !== post.title || body !== post.body || factsChanged) {
      await client.query(
        "INSERT INTO post_revisions (post_id, title, body, facts, created_at) VALUES ($1, $2, $3, $4, $5)",
        [id, post.title, post.body, JSON.stringify(oldFacts.rows[0]!.facts), post.updated_at],
      );
      await client.query("UPDATE posts SET revision_count = revision_count + 1 WHERE id = $1", [id]);
    }
    await client.query(
      `UPDATE posts SET title = $2, body = $3, updated_at = now(),
         spam_score = $4, is_suppressed = $5, moderation_note = $6, moderated_by = $7
       WHERE id = $1`,
      [id, title, body, ...moderationParams(heuristicSpam(title, body), await getRule("spam_suppress_score"))],
    );
    if (input.summary) await insertSummary(client, id, input.summary);
    if (input.sources) await setPostSources(client, id, input.sources);
    // 사진을 먼저 붙인다 — 수치의 근거 사진은 이 글에 붙은 사진이어야 한다 (Sprint 20)
    const removedImages = input.images ? await setPostImages(client, id, input.images) : [];
    if (input.products || input.facts) {
      const productIds = input.products
        ? await setPostProducts(client, id, post.category_id, input.products, fp)
        : await currentProductIds(client, id);
      if (input.facts) await setPostFacts(client, id, productIds, input.facts);
    }
    return removedImages;
  });
  // 파일은 커밋이 끝난 뒤 지운다 (롤백되면 파일이 남아 있어야 하므로)
  if (removed.length) await deleteFiles(removed);
  return (await getPost(id))!;
}

export async function deletePost(id: string, fp: string, pin: string): Promise<void> {
  await deletePostInner(id, fp, pin);
  // 읽기 전용 모드 저장본에서도 바로 지운다 (Sprint 29)
  await deleteSnapshot(`/posts/${id}`);
}

async function deletePostInner(id: string, fp: string, pin: string): Promise<void> {
  const imageIds = await tx(async (client) => {
    const post = await loadPost(id, client, true);
    if (!post) throw notFound();
    await assertPin(`post:${id}`, fp, pin, post.pw_hash);
    const { rows } = await client.query<{ id: string }>("SELECT id FROM post_images WHERE post_id = $1", [id]);
    await client.query("DELETE FROM posts WHERE id = $1", [id]); // post_images 는 CASCADE
    return rows.map((r) => r.id);
  });
  if (imageIds.length) await deleteFiles(imageIds);
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
    if (!(await hit(`summary:${fp}`, 10, 60_000))) throw tooMany();
    summary = { ...(await generateSummary(post.title, post.body)), isAuthorEdited: false };
  }
  await tx((client) => insertSummary(client, id, summary));
  return (await getPost(id))!;
}

// ---------------------------------------------------------------------------
// AI 1차 정화
// ---------------------------------------------------------------------------

function moderationParams(v: SpamVerdict, spamCut: number): [number, boolean, string, string] {
  return [v.score, shouldSuppress(v, spamCut), moderationNote(v), v.model];
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
     WHERE id = $1 AND date_trunc('milliseconds', updated_at) = $6::timestamptz
       AND moderated_by <> 'operator'`, // 운영자가 오탐으로 해제한 뒤 늦게 끝난 AI 판정이 덮어쓰지 않게
    [id, ...moderationParams(verdict, await getRule("spam_suppress_score")), post.updated_at],
  );
  return verdict;
}

// ---------------------------------------------------------------------------
// 추천/비추천 — fingerprint당 1표. 같은 값을 다시 누르면 취소, 반대 값이면 변경.
// ---------------------------------------------------------------------------

export type VoteResult = { upvotes: number; downvotes: number; myVote: 1 | -1 | 0; trust_tier: string };

export async function votePost(id: string, fp: string, value: 1 | -1): Promise<VoteResult> {
  if (!/^\d{1,18}$/.test(id)) throw notFound();
  try {
    return await votePostOnce(id, fp, value);
  } catch (err) {
    // 같은 사람의 동시 투표 두 건이 함께 INSERT 하려다 한쪽이 유니크 제약에 걸린 경우 — 한 번 더 하면 토글 규칙대로 처리된다
    if (isUniqueViolation(err)) return votePostOnce(id, fp, value);
    throw err;
  }
}

async function votePostOnce(id: string, fp: string, value: 1 | -1): Promise<VoteResult> {
  return tx(async (client) => {
    // 인기 글에 투표가 몰려도 줄이 짧도록 글 행은 미리 잠그지 않는다.
    // 카운터 트리거(trg_votes_count)의 UPDATE 가 행을 잠그고, 커밋까지 잠금 구간은 그 뒤 두 단계뿐이다.
    // 투표는 커밋 WAL 디스크 기록을 기다리지 않는다 — 서버가 비정상 종료되면 마지막 순간의 투표 몇 건만 잃을 수 있다.
    await client.query("SET LOCAL synchronous_commit = off");
    const { rows: found } = await client.query<{ is_blinded: boolean }>("SELECT is_blinded FROM posts WHERE id = $1", [id]);
    if (!found[0]) throw notFound();
    if (found[0].is_blinded) throw blinded();

    const existing = await client.query<{ value: number }>(
      "SELECT value FROM votes WHERE post_id = $1 AND voter_fingerprint = $2 FOR UPDATE",
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
  if (!(await hit(`report:${fp}`, 20, 60 * 60 * 1000))) throw tooMany();
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

/** 최신 판부터. offset·limit 로 나눠 본다 (한 화면의 비교 계산량을 묶어 두려고) */
export async function listRevisions(postId: string, offset = 0, limit = 50): Promise<PostRevision[]> {
  if (!/^\d{1,18}$/.test(postId)) return [];
  return query<PostRevision>(
    `SELECT id, title, body, facts, created_at, replaced_at, redacted_by
       FROM post_revisions WHERE post_id = $1 ORDER BY id DESC OFFSET $2 LIMIT $3`,
    [postId, offset, limit],
  );
}

/**
 * 수정 이력의 이전 판 지우기 (보안 점검 반영). 수정으로 뺀 연락처·명예훼손 표현이 이력에 남지 않게.
 *  - 작성자: 글 비밀번호
 *  - 운영자: 법적 요청(명예훼손·개인정보 등)일 때만, 투명성 기록에 공개
 * 판이 있었다는 사실(시각)은 남기고 제목·본문·수치만 지운다.
 */
export async function redactRevision(
  postId: string,
  revisionId: string,
  by: { kind: "author"; fp: string; pin: string } | { kind: "legal"; reason: string; note: string },
): Promise<void> {
  if (!/^\d{1,18}$/.test(postId) || !/^\d{1,18}$/.test(revisionId)) throw notFound("수정 이력");
  await tx(async (client) => {
    const post = await loadPost(postId, client, true);
    if (!post) throw notFound();
    if (by.kind === "author") await assertPin(`post:${postId}`, by.fp, by.pin, post.pw_hash);
    const r = await client.query(
      `UPDATE post_revisions SET title = '', body = '', facts = '[]', redacted_at = now(), redacted_by = $3
        WHERE id = $1 AND post_id = $2 AND redacted_at IS NULL`,
      [revisionId, postId, by.kind],
    );
    if (!r.rowCount) throw notFound("수정 이력");
    if (by.kind === "legal") {
      await client.query(
        `INSERT INTO moderation_log (action, post_id, subject_type, subject_id, reason, note) VALUES ('revision_redacted', $1::bigint, 'post', $1::text, $2, $3)`,
        [postId, by.reason, by.note || `수정 이력 #${revisionId}`],
      );
    }
  });
}

/** sitemap 용 */
export async function listPostIdsForSitemap(limit = 5000): Promise<{ id: string; updated_at: string }[]> {
  // 잡담은 검색 노출 대상에서 제외 — 정보 아카이브로서의 SEO 품질 유지
  return query(
    `SELECT id, updated_at FROM posts WHERE NOT is_blinded AND NOT is_suppressed AND post_type <> 'chat' ORDER BY id DESC LIMIT $1`,
    [limit],
  );
}
