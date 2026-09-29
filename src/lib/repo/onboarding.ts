/**
 * 첫 방문·빈 보드 온보딩에 쓰는 조회 (Sprint 32).
 */
import { query } from "../db";
import { listRenewals, type RenewalItem } from "./renewal-feed";

const VISIBLE = "NOT p.is_blinded AND NOT p.is_suppressed";

export type LonelyProduct = { id: string; brand: string; name: string };
export type BoardNeeds = {
  /** 보이는 정보 글 수 (잡담·정모 제외) */
  infoPosts: number;
  /** 리뉴얼로 보이지만 제보가 더 필요한 제품 */
  pending: RenewalItem[];
  /** 글이 하나뿐인 제품 — 같은 제품 라벨을 한 번 더 올리면 교차 확인이 된다 */
  lonely: LonelyProduct[];
};

export async function boardNeeds(categoryId: number, limit = 5): Promise<BoardNeeds> {
  const [count, pending, lonely] = await Promise.all([
    query<{ n: number }>(
      `SELECT count(*)::int AS n FROM posts p WHERE p.category_id = $1 AND p.post_type = 'info' AND ${VISIBLE}`,
      [categoryId],
    ),
    listRenewals({ status: "pending", categoryId, pageSize: limit }),
    query<LonelyProduct>(
      `SELECT pr.id::text, pr.brand, pr.name
         FROM products pr
         JOIN LATERAL (
           SELECT count(*)::int AS n, max(p.created_at) AS last FROM post_products pp JOIN posts p ON p.id = pp.post_id
            WHERE pp.product_id = pr.id AND ${VISIBLE}
         ) v ON v.n = 1
        WHERE pr.category_id = $1 AND pr.merged_into IS NULL
        ORDER BY v.last DESC, pr.id DESC LIMIT $2`,
      [categoryId, limit],
    ),
  ]);
  return { infoPosts: count[0]?.n ?? 0, pending: pending.items, lonely };
}

export type SiteStats = { posts: number; products: number; boards: number };

/** 첫 방문 안내의 한 줄 요약 */
export async function siteStats(): Promise<SiteStats> {
  const rows = await query<SiteStats>(
    `SELECT (SELECT count(*)::int FROM posts p WHERE ${VISIBLE}) AS posts,
            (SELECT count(*)::int FROM products pr WHERE pr.merged_into IS NULL
               AND EXISTS (SELECT 1 FROM post_products pp JOIN posts p ON p.id = pp.post_id WHERE pp.product_id = pr.id AND ${VISIBLE})) AS products,
            (SELECT count(*)::int FROM categories) AS boards`,
  );
  return rows[0]!;
}
