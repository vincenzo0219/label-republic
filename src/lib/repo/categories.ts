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
