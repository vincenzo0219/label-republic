import { query } from "../db";
import type { Category } from "../types";

const COLS = "id, name, slug, description, post_count, auto_promoted_at";

export async function listCategories(): Promise<Category[]> {
  return query<Category>(`SELECT ${COLS} FROM categories ORDER BY sort_order, id`);
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const rows = await query<Category>(`SELECT ${COLS} FROM categories WHERE slug = $1`, [slug]);
  return rows[0] ?? null;
}

/** 방별로 since 이후 올라온 (보이는) 글 수 — 방 탭 "새 글 N" (Sprint 41). 방당 100에서 멈춘다 */
export async function newPostCounts(pairs: { slug: string; since: Date }[]): Promise<Record<string, number>> {
  const rows = await query<{ slug: string; n: number }>(
    `SELECT c.slug,
            (SELECT count(*)::int FROM (SELECT 1 FROM posts p
               WHERE p.category_id = c.id AND p.created_at > x.since AND NOT p.is_blinded AND NOT p.is_suppressed
               LIMIT 100) t) AS n
       FROM unnest($1::text[], $2::timestamptz[]) AS x(slug, since)
       JOIN categories c ON c.slug = x.slug`,
    [pairs.map((p) => p.slug), pairs.map((p) => p.since.toISOString())],
  );
  return Object.fromEntries(rows.filter((r) => r.n > 0).map((r) => [r.slug, r.n]));
}

export type RoomTools = { products: boolean; facts: boolean; renewals: boolean };

/**
 * 방 상단 도구(제품별·성분/스펙별·라벨 변경)는 그 방에 데이터가 있을 때만 보인다 (Sprint 42).
 * 원래 팩트체크용으로 모든 방에 있던 버튼이, 데이터 없는 방에서 빈 화면으로 이어지지 않게. 모두 EXISTS 라 바로 끝난다.
 */
export async function roomTools(categoryId: number): Promise<RoomTools> {
  const rows = await query<RoomTools>(
    `SELECT EXISTS (SELECT 1 FROM products p JOIN post_products pp ON pp.product_id = p.id JOIN posts po ON po.id = pp.post_id
                     WHERE p.category_id = $1 AND p.merged_into IS NULL AND NOT po.is_blinded) AS products,
            EXISTS (SELECT 1 FROM products p JOIN product_facts f ON f.product_id = p.id JOIN posts po ON po.id = f.post_id
                     WHERE p.category_id = $1 AND NOT po.is_blinded) AS facts,
            EXISTS (SELECT 1 FROM products p JOIN product_renewals r ON r.product_id = p.id WHERE p.category_id = $1) AS renewals`,
    [categoryId],
  );
  return rows[0]!;
}

/** 성분표가 중심인 방은 "성분별", 나머지는 "스펙별" */
export const INGREDIENT_ROOMS = new Set(["supplements", "pet-food"]);
