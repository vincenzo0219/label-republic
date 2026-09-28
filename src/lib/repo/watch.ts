/**
 * 관심 제품·지켜보는 글의 새 소식 (Sprint 16).
 *
 * 목록은 브라우저가 요청마다 보내고(리포트·배지) 서버는 저장하지 않는다. 푸시 알림을 켠 경우에만
 * push_subscriptions 에 목록이 있고, 알림 배치(src/lib/jobs/push.ts)가 같은 함수로 새 소식을 센다.
 * 요청한 사람 본인의 활동(내가 단 댓글·제안, 내가 쓴 글·수정)은 fingerprint 로 빼고 센다.
 */
import { query } from "../db";
import type { PostCard } from "../types";
import { listPosts } from "./posts";

export const MAX_WATCH_PRODUCTS = 30;
export const MAX_WATCH_POSTS = 50;

const VISIBLE = "NOT p.is_blinded AND NOT p.is_suppressed";

export type ProductUpdate = {
  id: string;
  brand: string;
  name: string;
  /** 병합된 제품이면 합쳐진 제품 번호 — 브라우저는 목록의 번호를 바꾼다 */
  merged_into: string | null;
  new_posts: number;
  /** 이 제품 글에 새로 "커뮤니티 동의"가 된 정정 제안 */
  newly_supported: number;
  /** 새 글 미리보기 (최신 3개) */
  posts: PostCard[];
};

export type PostUpdate = {
  id: string;
  title: string;
  is_blinded: boolean;
  new_comments: number;
  new_corrections: number;
  newly_supported: number;
  applied: number;
  edited: boolean;
};

export type WatchUpdates = {
  products: ProductUpdate[];
  posts: PostUpdate[];
  /** 지워진 글 — 브라우저는 목록에서 뺀다 */
  gone: string[];
  total: number;
};

/** "1,2,3" → 숫자 id 목록 (중복·잘못된 값 제거, 최대 max 개) */
export function parseIds(raw: string | null | undefined, max: number): string[] {
  return Array.from(new Set((raw ?? "").split(",").map((s) => s.trim()).filter((s) => /^\d{1,18}$/.test(s)))).slice(0, max);
}

export function postUpdateCount(u: PostUpdate): number {
  return u.new_comments + u.new_corrections + u.newly_supported + u.applied + (u.edited ? 1 : 0);
}

export async function watchUpdates(
  productIds: string[],
  postIds: string[],
  since: Date,
  fp: string | null,
  opts: { previews?: boolean } = {},
): Promise<WatchUpdates> {
  const sinceIso = since.toISOString();
  const [products, posts] = await Promise.all([
    productIds.length
      ? query<Omit<ProductUpdate, "posts">>(
          `SELECT pr.id::text, t.brand, t.name, pr.merged_into::text,
                  (SELECT count(*)::int FROM post_products pp JOIN posts p ON p.id = pp.post_id
                    WHERE pp.product_id = t.id AND ${VISIBLE} AND p.created_at > $2::timestamptz
                      AND p.author_fingerprint IS DISTINCT FROM $3) AS new_posts,
                  (SELECT count(*)::int FROM post_products pp JOIN posts p ON p.id = pp.post_id JOIN corrections c ON c.post_id = p.id
                    WHERE pp.product_id = t.id AND NOT p.is_blinded AND c.supported_at > $2::timestamptz
                      AND c.status IN ('open', 'answered') AND NOT c.is_hidden) AS newly_supported
             FROM products pr JOIN products t ON t.id = coalesce(pr.merged_into, pr.id)
            WHERE pr.id = ANY($1::bigint[])`,
          [productIds, sinceIso, fp],
        )
      : Promise.resolve([]),
    postIds.length
      ? query<PostUpdate>(
          `SELECT p.id::text, CASE WHEN p.is_blinded THEN '' ELSE p.title END AS title, p.is_blinded,
                  CASE WHEN p.is_blinded THEN 0 ELSE (SELECT count(*)::int FROM comments c
                    WHERE c.post_id = p.id AND c.created_at > $2::timestamptz AND c.author_fingerprint IS DISTINCT FROM $3) END AS new_comments,
                  CASE WHEN p.is_blinded THEN 0 ELSE (SELECT count(*)::int FROM corrections c
                    WHERE c.post_id = p.id AND c.created_at > $2::timestamptz AND NOT c.is_hidden AND c.author_fingerprint IS DISTINCT FROM $3) END AS new_corrections,
                  CASE WHEN p.is_blinded THEN 0 ELSE (SELECT count(*)::int FROM corrections c
                    WHERE c.post_id = p.id AND c.supported_at > $2::timestamptz AND NOT c.is_hidden AND c.status IN ('open', 'answered')) END AS newly_supported,
                  CASE WHEN p.is_blinded OR p.author_fingerprint IS NOT DISTINCT FROM $3 THEN 0 ELSE (SELECT count(*)::int FROM corrections c
                    WHERE c.post_id = p.id AND c.status = 'applied' AND c.resolved_at > $2::timestamptz AND NOT c.is_hidden) END AS applied,
                  NOT p.is_blinded AND p.author_fingerprint IS DISTINCT FROM $3
                    AND EXISTS (SELECT 1 FROM post_revisions r WHERE r.post_id = p.id AND r.replaced_at > $2::timestamptz) AS edited
             FROM posts p WHERE p.id = ANY($1::bigint[])
            ORDER BY array_position($1::bigint[], p.id)`,
          [postIds, sinceIso, fp],
        )
      : Promise.resolve([]),
  ]);
  // 미리보기는 새 글이 있는 제품 5개까지만 (요청 하나의 조회 수를 묶어 둔다)
  const previewIds = new Set(products.filter((p) => p.new_posts > 0).slice(0, 5).map((p) => p.id));
  const withPosts: ProductUpdate[] = await Promise.all(
    products.map(async (p) => ({
      ...p,
      posts:
        opts.previews && previewIds.has(p.id)
          ? (await listPosts({ productId: p.merged_into ?? p.id, since, sort: "latest", pageSize: 3, excludeAuthor: fp, noCount: true })).items.filter((x) => !x.is_suppressed)
          : [],
    })),
  );
  const found = new Set(posts.map((p) => p.id));
  const total = withPosts.reduce((n, p) => n + p.new_posts + p.newly_supported, 0) + posts.reduce((n, p) => n + postUpdateCount(p), 0);
  return { products: withPosts, posts, gone: postIds.filter((id) => !found.has(id)), total };
}
