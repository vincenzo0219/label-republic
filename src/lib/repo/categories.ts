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
