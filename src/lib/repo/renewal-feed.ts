/**
 * 리뉴얼 이력 공개 피드 (Sprint 28) — 정리 배치가 남긴 product_renewals(Sprint 25~26)를 전체·보드·브랜드별로 보여준다.
 *
 * 보이는 글이 하나라도 있는 제품만 (제품 페이지와 같은 규칙). 판단은 규칙(src/lib/renewals.ts)이 하고,
 * 이 목록은 제조사 발표가 아니라 이용자 제보를 규칙으로 정리한 결과라는 점을 화면에 밝힌다.
 */
import { query } from "../db";
import { fromBase, normText } from "../products";
import { changePct } from "../renewals";

const VISIBLE_PRODUCT = `pr.merged_into IS NULL AND EXISTS (
  SELECT 1 FROM post_products pp JOIN posts p ON p.id = pp.post_id
   WHERE pp.product_id = pr.id AND NOT p.is_blinded AND NOT p.is_suppressed)`;

export type RenewalStatus = "confirmed" | "pending";

export type RenewalItem = {
  id: string;
  status: RenewalStatus;
  product: { id: string; brand: string; name: string };
  brand_key: string;
  category: { slug: string; name: string };
  attribute: string;
  basis: string;
  unit: string;
  /** 표시 단위 값 */
  from: number;
  to: number;
  change_pct: number | null;
  last_old_at: string;
  first_new_at: string;
  time_basis: "made" | "posted";
  confirmed_at: string | null;
  new_reports: number;
  new_authors: number;
  new_photos: number;
};

type Row = Omit<RenewalItem, "from" | "to" | "change_pct" | "product" | "category"> & {
  old_base: number; new_base: number; product_id: string; brand: string; name: string; slug: string; category_name: string;
};

function toItem(r: Row): RenewalItem {
  const from = fromBase(r.old_base, r.unit);
  const to = fromBase(r.new_base, r.unit);
  return {
    id: r.id, status: r.status,
    product: { id: r.product_id, brand: r.brand, name: r.name },
    brand_key: r.brand_key,
    category: { slug: r.slug, name: r.category_name },
    attribute: r.attribute, basis: r.basis, unit: r.unit, from, to, change_pct: changePct(from, to),
    last_old_at: r.last_old_at, first_new_at: r.first_new_at, time_basis: r.time_basis, confirmed_at: r.confirmed_at,
    new_reports: r.new_reports, new_authors: r.new_authors, new_photos: r.new_photos,
  };
}

/** 브랜드 이름 → 주소용 키 (제품 정규화와 같은 규칙: "NOW Foods" → "nowfoods") */
export function brandKey(brand: string): string {
  return normText(brand).slice(0, 60);
}

export type RenewalQuery = {
  status?: RenewalStatus;
  categoryId?: number;
  brandKey?: string;
  /** 이 시각 이후 확인된 것만 (확인됨) */
  since?: Date;
  page?: number;
  pageSize?: number;
};

export async function listRenewals(q: RenewalQuery = {}): Promise<{ items: RenewalItem[]; total: number; page: number; pageSize: number }> {
  const status = q.status ?? "confirmed";
  const pageSize = Math.min(Math.max(q.pageSize ?? 20, 1), 100);
  const page = Math.max(1, Math.floor(q.page ?? 1));
  const args: unknown[] = [status];
  const where = ["r.status = $1", VISIBLE_PRODUCT];
  if (q.categoryId) {
    args.push(q.categoryId);
    where.push(`pr.category_id = $${args.length}`);
  }
  if (q.brandKey) {
    args.push(q.brandKey);
    where.push(`split_part(pr.norm_key, '|', 1) = $${args.length}`);
  }
  if (q.since) {
    args.push(q.since.toISOString());
    where.push(`r.confirmed_at > $${args.length}::timestamptz`);
  }
  const from = `FROM product_renewals r JOIN products pr ON pr.id = r.product_id JOIN categories c ON c.id = pr.category_id WHERE ${where.join(" AND ")}`;
  const [rows, count] = await Promise.all([
    query<Row>(
      `SELECT r.id::text, r.status, r.product_id::text, pr.brand, pr.name, split_part(pr.norm_key, '|', 1) AS brand_key,
              c.slug, c.name AS category_name, r.attribute, r.basis, r.unit, r.old_base, r.new_base,
              r.last_old_at, r.first_new_at, r.time_basis, r.confirmed_at, r.new_reports, r.new_authors, r.new_photos
         ${from}
        ORDER BY coalesce(r.confirmed_at, r.first_new_at) DESC, r.id DESC
        LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
      [...args, pageSize, (page - 1) * pageSize],
    ),
    query<{ n: number }>(`SELECT count(*)::int AS n ${from}`, args),
  ]);
  return { items: rows.map(toItem), total: count[0]?.n ?? 0, page, pageSize };
}

export type BrandProduct = { id: string; name: string; category: { slug: string; name: string }; post_count: number; renewals: number; pending: number };
export type BrandHistory = {
  key: string;
  /** 가장 많이 쓴 표기 */
  brand: string;
  products: BrandProduct[];
  renewals: RenewalItem[];
  pending: RenewalItem[];
  stats: { products: number; renewed_products: number; renewals: number; decreased: number; increased: number };
};

/** 브랜드별 변경 이력 — 보이는 제품이 없으면 null */
export async function brandHistory(key: string): Promise<BrandHistory | null> {
  if (!key || key.length > 60 || normText(key) !== key) return null;
  const products = await query<BrandProduct & { brand: string; slug: string; category_name: string }>(
    `SELECT pr.id::text, pr.brand, pr.name, c.slug, c.name AS category_name,
            (SELECT count(*)::int FROM post_products pp JOIN posts p ON p.id = pp.post_id
              WHERE pp.product_id = pr.id AND NOT p.is_blinded AND NOT p.is_suppressed) AS post_count,
            (SELECT count(*)::int FROM product_renewals r WHERE r.product_id = pr.id AND r.status = 'confirmed') AS renewals,
            (SELECT count(*)::int FROM product_renewals r WHERE r.product_id = pr.id AND r.status = 'pending') AS pending
       FROM products pr JOIN categories c ON c.id = pr.category_id
      WHERE split_part(pr.norm_key, '|', 1) = $1 AND ${VISIBLE_PRODUCT}
      ORDER BY renewals DESC, post_count DESC, pr.id
      LIMIT 200`,
    [key],
  );
  if (!products.length) return null;
  const [confirmed, pending, dir] = await Promise.all([
    listRenewals({ brandKey: key, status: "confirmed", pageSize: 100 }),
    listRenewals({ brandKey: key, status: "pending", pageSize: 50 }),
    query<{ decreased: number; increased: number }>(
      `SELECT count(*) FILTER (WHERE r.new_base < r.old_base)::int AS decreased, count(*) FILTER (WHERE r.new_base > r.old_base)::int AS increased
         FROM product_renewals r JOIN products pr ON pr.id = r.product_id
        WHERE r.status = 'confirmed' AND split_part(pr.norm_key, '|', 1) = $1 AND ${VISIBLE_PRODUCT}`,
      [key],
    ),
  ]);
  const counts = new Map<string, number>();
  for (const p of products) counts.set(p.brand, (counts.get(p.brand) ?? 0) + 1);
  const brand = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  return {
    key,
    brand,
    products: products.map((p) => ({ id: p.id, name: p.name, category: { slug: p.slug, name: p.category_name }, post_count: p.post_count, renewals: p.renewals, pending: p.pending })),
    renewals: confirmed.items,
    pending: pending.items,
    stats: {
      products: products.length,
      renewed_products: products.filter((p) => p.renewals > 0).length,
      renewals: confirmed.total,
      decreased: dir[0]?.decreased ?? 0,
      increased: dir[0]?.increased ?? 0,
    },
  };
}

export type BrandCount = { key: string; brand: string; renewals: number; products: number };

/** 라벨 변경이 확인된 브랜드 (많은 순) */
export async function topRenewalBrands(opts: { categoryId?: number; limit?: number } = {}): Promise<BrandCount[]> {
  const args: unknown[] = [opts.limit ?? 10];
  const where = ["r.status = 'confirmed'", VISIBLE_PRODUCT];
  if (opts.categoryId) {
    args.push(opts.categoryId);
    where.push(`pr.category_id = $${args.length}`);
  }
  return query<BrandCount>(
    `SELECT split_part(pr.norm_key, '|', 1) AS key, mode() WITHIN GROUP (ORDER BY pr.brand) AS brand,
            count(*)::int AS renewals, count(DISTINCT pr.id)::int AS products
       FROM product_renewals r JOIN products pr ON pr.id = r.product_id
      WHERE ${where.join(" AND ")}
      GROUP BY 1 ORDER BY renewals DESC, key LIMIT $1`,
    args,
  );
}
