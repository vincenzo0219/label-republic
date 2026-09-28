/**
 * 제품 태그·수치 (Sprint 14).
 *
 * - 제품은 글에 태그하면서 만든다. 같은 보드에서 브랜드·제품명 정규화 값이 같으면 같은 제품이다.
 * - 목록이 곧 최종 상태: 작성·수정 시 받은 제품·수치 목록으로 바꾼다.
 * - 제품 페이지·검색·비교에는 "보이는 글"(블라인드·광고 의심이 아닌 글)의 내용만 모인다.
 *   보이는 글이 하나도 없는 제품은 없는 것으로 취급한다 (광고용 제품 페이지 방지).
 */
import type { PoolClient } from "pg";
import { query } from "../db";
import { HttpError } from "../errors";
import {
  attrKey,
  FACT_KIND_LABEL,
  fromBase,
  MAX_FACTS_PER_POST,
  MAX_PRODUCTS_PER_POST,
  median,
  normalizeUnit,
  normText,
  productKey,
  productNameProblem,
  toBase,
  validUnit,
  type FactKind,
} from "../products";
import type { PostFact, ProductTag } from "../types";

export type ProductRef = { id: string } | { brand: string; name: string };
/** product: 같은 요청의 제품 목록에서의 순서 (0부터) */
export type FactInput = { product: number; attribute: string; value: number; unit: string; basis?: string; kind: FactKind };

const ID = /^\d{1,18}$/;
const VISIBLE = "NOT p.is_blinded AND NOT p.is_suppressed";

function badProduct(message: string) {
  return new HttpError(400, "invalid_product", message);
}

/** 병합된 제품이면 최종 제품까지 따라간다 (병합 시 체인을 펴 두므로 보통 한 단계) */
async function resolveMerged(client: PoolClient, id: string): Promise<{ id: string; category_id: number } | null> {
  let cur = id;
  for (let i = 0; i < 5; i++) {
    const { rows } = await client.query<{ id: string; category_id: number; merged_into: string | null }>(
      "SELECT id, category_id, merged_into FROM products WHERE id = $1",
      [cur],
    );
    if (!rows[0]) return null;
    if (!rows[0].merged_into) return rows[0];
    cur = rows[0].merged_into;
  }
  return null;
}

async function findOrCreate(client: PoolClient, categoryId: number, brand: string, name: string, fp?: string): Promise<string> {
  const problem = productNameProblem(brand, name);
  if (problem) throw badProduct(problem);
  const key = productKey(brand, name);
  // 이미 있으면 INSERT 하지 않는다 (ON CONFLICT 도 시퀀스 번호를 소모하므로 먼저 찾는다)
  const found = await client.query<{ id: string }>("SELECT id FROM products WHERE category_id = $1 AND norm_key = $2", [categoryId, key]);
  if (found.rows[0]) {
    const resolved = await resolveMerged(client, found.rows[0].id);
    if (!resolved) throw badProduct("제품 정보를 찾을 수 없습니다.");
    return resolved.id;
  }
  await client.query(
    `INSERT INTO products (category_id, brand, name, norm_key, created_by_fingerprint) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (category_id, norm_key) DO NOTHING`,
    [categoryId, brand.trim().replace(/\s+/g, " "), name.trim().replace(/\s+/g, " "), key, fp ?? null],
  );
  const { rows } = await client.query<{ id: string }>("SELECT id FROM products WHERE category_id = $1 AND norm_key = $2", [categoryId, key]);
  const resolved = await resolveMerged(client, rows[0]!.id);
  if (!resolved) throw badProduct("제품 정보를 찾을 수 없습니다.");
  return resolved.id;
}

/** 글의 제품 태그를 refs 로 바꾸고, 최종 제품 id 목록(순서대로)을 돌려준다. 빠진 제품의 수치도 지운다. */
export async function setPostProducts(client: PoolClient, postId: string, categoryId: number, refs: ProductRef[], fp?: string): Promise<string[]> {
  if (refs.length > MAX_PRODUCTS_PER_POST) throw badProduct(`제품은 글당 ${MAX_PRODUCTS_PER_POST}개까지 태그할 수 있습니다.`);
  const ids: string[] = [];
  for (const ref of refs) {
    let id: string;
    if ("id" in ref) {
      const p = ID.test(ref.id) ? await resolveMerged(client, ref.id) : null;
      if (!p) throw badProduct("존재하지 않는 제품입니다.");
      if (p.category_id !== categoryId) throw badProduct("다른 보드의 제품은 태그할 수 없습니다.");
      id = p.id;
    } else {
      id = await findOrCreate(client, categoryId, ref.brand, ref.name, fp);
    }
    // 같은 제품을 두 번 적으면 한 번만 — 그래도 수치의 제품 순서가 어긋나지 않게 자리는 남긴다
    ids.push(id);
  }
  const unique = [...new Set(ids)];
  await client.query("DELETE FROM post_products WHERE post_id = $1 AND NOT (product_id = ANY($2::bigint[]))", [postId, unique]);
  await client.query("DELETE FROM product_facts WHERE post_id = $1 AND NOT (product_id = ANY($2::bigint[]))", [postId, unique]);
  for (const [position, id] of unique.entries()) {
    await client.query(
      `INSERT INTO post_products (post_id, product_id, position) VALUES ($1, $2, $3)
       ON CONFLICT (post_id, product_id) DO UPDATE SET position = EXCLUDED.position`,
      [postId, id, position],
    );
  }
  return ids;
}

export async function currentProductIds(client: PoolClient, postId: string): Promise<string[]> {
  const { rows } = await client.query<{ product_id: string }>("SELECT product_id FROM post_products WHERE post_id = $1 ORDER BY position", [postId]);
  return rows.map((r) => r.product_id);
}

/** 글의 수치를 facts 로 바꾼다. productIds 는 setPostProducts 가 돌려준 순서 */
export async function setPostFacts(client: PoolClient, postId: string, productIds: string[], facts: FactInput[]): Promise<void> {
  if (facts.length > MAX_FACTS_PER_POST) throw badProduct(`수치는 글당 ${MAX_FACTS_PER_POST}개까지 적을 수 있습니다.`);
  const rows = facts.map((f, i) => {
    const productId = productIds[f.product];
    if (!productId) throw badProduct(`${i + 1}번째 수치의 제품을 선택해주세요.`);
    const attribute = f.attribute.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 40);
    const key = attrKey(attribute);
    if (!key) throw badProduct(`${i + 1}번째 수치의 항목 이름을 입력해주세요.`);
    const unit = normalizeUnit(f.unit);
    if (!validUnit(unit)) throw badProduct(`${i + 1}번째 수치의 단위를 확인해주세요 (예: mg, µg, IU, g, %).`);
    if (!Number.isFinite(f.value) || f.value < 0 || f.value >= 1e12) throw badProduct(`${i + 1}번째 수치의 값을 확인해주세요.`);
    return { productId, attribute, key, value: Math.round(f.value * 10_000) / 10_000, unit, basis: (f.basis ?? "").normalize("NFKC").trim().slice(0, 30), kind: f.kind };
  });
  await client.query("DELETE FROM product_facts WHERE post_id = $1", [postId]);
  for (const [position, r] of rows.entries()) {
    await client.query(
      `INSERT INTO product_facts (post_id, product_id, position, attribute, attr_key, value, unit, basis, kind)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [postId, r.productId, position, r.attribute, r.key, r.value, r.unit, r.basis, r.kind],
    );
  }
}

export async function listPostFacts(postId: string): Promise<PostFact[]> {
  if (!ID.test(postId)) return [];
  return query<PostFact>(
    `SELECT product_id::text, attribute, value::float8 AS value, unit, basis, kind FROM product_facts WHERE post_id = $1 ORDER BY position`,
    [postId],
  );
}

// ---------------------------------------------------------------------------
// 제품 페이지·비교
// ---------------------------------------------------------------------------

export type Product = ProductTag & { category: { slug: string; name: string }; category_id: number; post_count: number; created_at: string };

/** 병합된 제품이면 { redirect }, 보이는 글이 없으면 null */
export async function getProduct(id: string): Promise<Product | { redirect: string } | null> {
  if (!ID.test(id)) return null;
  const rows = await query<Product & { merged_into: string | null }>(
    `SELECT pr.id::text, pr.brand, pr.name, pr.merged_into::text, pr.category_id, pr.created_at,
            json_build_object('slug', c.slug, 'name', c.name) AS category,
            (SELECT count(*)::int FROM post_products pp JOIN posts p ON p.id = pp.post_id WHERE pp.product_id = pr.id AND ${VISIBLE}) AS post_count
       FROM products pr JOIN categories c ON c.id = pr.category_id WHERE pr.id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  if (row.merged_into) {
    const target = await query<{ id: string }>(
      `WITH RECURSIVE chain AS (SELECT id, merged_into, 0 AS depth FROM products WHERE id = $1
         UNION ALL SELECT p.id, p.merged_into, depth + 1 FROM products p JOIN chain ON p.id = chain.merged_into WHERE depth < 5)
       SELECT id::text FROM chain WHERE merged_into IS NULL LIMIT 1`,
      [row.merged_into],
    );
    return target[0] ? { redirect: target[0].id } : null;
  }
  if (!row.post_count) return null;
  const { merged_into: _m, ...product } = row;
  return product;
}

export type FactEntry = { post_id: string; value: number; unit: string; kind: FactKind; disputed: boolean };
/** 같은 항목·기준·단위 묶음의 값 모음 (값은 display 단위로 환산) */
export type FactGroup = {
  key: string;
  attribute: string;
  basis: string;
  unit: string;
  label: { median: number; n: number } | null;
  measured: { median: number; n: number } | null;
  /** 실측 중앙값이 표시 중앙값과 몇 % 다른가 */
  diff_pct: number | null;
  entries: FactEntry[];
  /** 정정 제안 때문에 집계에서 뺀 값 수 */
  disputed_n: number;
};

type FactRow = {
  product_id: string; post_id: string; attribute: string; attr_key: string; value: number; unit: string; basis: string; kind: FactKind;
  /** 커뮤니티가 동의한 정정 제안이 걸린 수치 — 집계(중앙값)에서 뺀다 */
  disputed?: boolean;
};

function mostCommon(xs: string[], tieBreak: (x: string) => number = () => 0): string {
  const counts = new Map<string, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || tieBreak(a[0]) - tieBreak(b[0]))[0]![0];
}

/** 이 단위로 쓰면 값이 읽기 좋은가 (1~1000 사이가 가장 좋다) — 단위가 동률일 때 고른다 */
function unitReadability(bases: number[], unit: string): number {
  const m = median(bases.map((b) => fromBase(b, unit)));
  if (m <= 0) return 0;
  const lg = Math.log10(m);
  return lg < 0 ? -lg : lg > 3 ? lg - 3 : 0;
}

/** 글별 수치를 항목·기준·단위 묶음별로 모은다. 같은 묶음 안의 mg/µg/g 는 가장 많이 쓴 단위로 환산한다. */
export function aggregateFacts(rows: FactRow[]): FactGroup[] {
  const groups = new Map<string, { rows: (FactRow & { base: number })[] }>();
  for (const r of rows) {
    const { group, base } = toBase(r.value, r.unit);
    const key = `${r.attr_key}|${normText(r.basis)}|${group}`;
    const g = groups.get(key) ?? { rows: [] };
    g.rows.push({ ...r, base });
    groups.set(key, g);
  }
  const out: FactGroup[] = [];
  for (const [key, g] of groups) {
    const bases = g.rows.map((r) => r.base);
    const unit = mostCommon(
      g.rows.map((r) => r.unit),
      (u) => unitReadability(bases, u),
    );
    const stat = (kind: FactKind) => {
      const vs = g.rows.filter((r) => r.kind === kind && !r.disputed).map((r) => fromBase(r.base, unit));
      return vs.length ? { median: median(vs), n: vs.length } : null;
    };
    const label = stat("label");
    const measured = stat("measured");
    out.push({
      key,
      attribute: mostCommon(g.rows.map((r) => r.attribute)),
      basis: mostCommon(g.rows.map((r) => r.basis)),
      unit,
      label,
      measured,
      diff_pct: label && measured && label.median > 0 ? ((measured.median - label.median) / label.median) * 100 : null,
      entries: g.rows.map((r) => ({ post_id: r.post_id, value: fromBase(r.base, unit), unit, kind: r.kind, disputed: !!r.disputed })),
      disputed_n: g.rows.filter((r) => r.disputed).length,
    });
  }
  // 글이 많이 적은 항목부터
  return out.sort((a, b) => b.entries.length - a.entries.length || a.attribute.localeCompare(b.attribute, "ko"));
}

async function factRows(productIds: string[]): Promise<FactRow[]> {
  return query<FactRow>(
    `SELECT f.product_id::text, f.post_id::text, f.attribute, f.attr_key, f.value::float8 AS value, f.unit, f.basis, f.kind,
            p.disputed_count > 0 AND EXISTS (
              SELECT 1 FROM corrections c
               WHERE c.post_id = f.post_id AND c.target = 'fact' AND c.status IN ('open', 'answered') AND c.is_supported AND NOT c.is_hidden
                 AND c.fact_product_id = f.product_id AND c.fact_attr_key = f.attr_key AND c.fact_kind = f.kind
                 AND c.fact_value = f.value AND c.fact_unit = f.unit AND c.fact_basis = f.basis) AS disputed
       FROM product_facts f JOIN posts p ON p.id = f.post_id
      WHERE f.product_id = ANY($1::bigint[]) AND ${VISIBLE}
      ORDER BY f.post_id DESC, f.position
      LIMIT 2000`,
    [productIds],
  );
}

export async function productFacts(productId: string): Promise<FactGroup[]> {
  return aggregateFacts(await factRows([productId]));
}

export type ProductPhoto = { id: string; post_id: string; alt: string; width: number; height: number; thumb_width: number; thumb_height: number };

/** 글마다 첫 사진 (최근 글부터) */
export async function productPhotos(productId: string, limit = 12): Promise<ProductPhoto[]> {
  return query<ProductPhoto>(
    `SELECT DISTINCT ON (p.id) i.id, p.id::text AS post_id, i.alt, i.width, i.height, i.thumb_width, i.thumb_height
       FROM post_products pp JOIN posts p ON p.id = pp.post_id JOIN post_images i ON i.post_id = p.id
      WHERE pp.product_id = $1 AND ${VISIBLE}
      ORDER BY p.id DESC, i.position
      LIMIT $2`,
    [productId, limit],
  );
}

export type ProductSource = { url: string; host: string; kind: string; label: string; page_title: string | null; status: string; post_id: string; cited: number };

/** 관련 글에 달린 출처 (같은 주소는 한 번, 여러 글이 인용한 순) */
export async function productSources(productId: string, limit = 20): Promise<ProductSource[]> {
  return query<ProductSource>(
    `SELECT DISTINCT ON (ps.url) ps.url, ps.host, ps.kind::text, ps.label, ps.page_title, ps.status::text, ps.post_id::text,
            count(*) OVER (PARTITION BY ps.url)::int AS cited
       FROM post_products pp JOIN posts p ON p.id = pp.post_id JOIN post_sources ps ON ps.post_id = p.id
      WHERE pp.product_id = $1 AND ${VISIBLE}
      ORDER BY ps.url, (ps.label <> '') DESC, ps.post_id DESC`,
    [productId],
  ).then((rows) => rows.sort((a, b) => b.cited - a.cited || Number(b.post_id) - Number(a.post_id)).slice(0, limit));
}

export type ProductListItem = ProductTag & { post_count: number; fact_count: number; category?: { slug: string; name: string } };

/** 자동완성·검색: 보이는 글이 있는 제품만. 표기가 달라도(띄어쓰기·대소문자) 찾도록 정규화 키도 비교 */
export async function searchProducts(q: string, categoryId?: number, limit = 10): Promise<ProductListItem[]> {
  // 검색어마다 정규화 키에 들어 있어야 한다 (AND) — "now mag" 가 "NOW Foods Magnesium" 을 찾는다
  const terms = [...new Set(q.slice(0, 60).split(/\s+/).map(normText).filter(Boolean))].slice(0, 5);
  if (!terms.length) return [];
  const args: unknown[] = [limit];
  const where = terms.map((t) => {
    args.push(`%${t.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
    return `replace(pr.norm_key, '|', '') LIKE $${args.length}`;
  });
  if (categoryId) {
    args.push(categoryId);
    where.push(`pr.category_id = $${args.length}`);
  }
  // 이름 조건으로 후보를 먼저 좁히고(짧은 이름 = 검색어와 가까운 이름 순 200개), 보이는 글 수는 후보에만 센다
  return query<ProductListItem>(
    `WITH cand AS MATERIALIZED (
       SELECT pr.id FROM products pr
        WHERE pr.merged_into IS NULL AND ${where.join(" AND ")}
        ORDER BY length(pr.norm_key), pr.id LIMIT 200
     )
     , top AS MATERIALIZED (
       SELECT cand.id, v.post_count
         FROM cand CROSS JOIN LATERAL (
           SELECT count(*)::int AS post_count
             FROM post_products pp JOIN posts p ON p.id = pp.post_id WHERE pp.product_id = cand.id AND ${VISIBLE}
         ) v
        WHERE v.post_count > 0
        ORDER BY v.post_count DESC, cand.id
        LIMIT $1
     )
     SELECT pr.id::text, pr.brand, pr.name, json_build_object('slug', c.slug, 'name', c.name) AS category, top.post_count,
            (SELECT count(*)::int FROM product_facts f JOIN posts p2 ON p2.id = f.post_id
              WHERE f.product_id = pr.id AND NOT p2.is_blinded AND NOT p2.is_suppressed) AS fact_count
       FROM top JOIN products pr ON pr.id = top.id JOIN categories c ON c.id = pr.category_id
      ORDER BY top.post_count DESC, pr.id`,
    args,
  );
}

// 보드 제품 목록은 보드의 모든 태그를 세므로(태그 2만 개에 ~100ms) 인스턴스별로 잠깐 캐시한다.
// 새 글의 태그가 목록 순서에 1분 늦게 반영될 수 있지만 제품 페이지·글에는 바로 보인다.
const BOARD_LIST_TTL_MS = 60_000;
const boardListCache = new Map<string, { at: number; value: { items: ProductListItem[]; hasMore: boolean } }>();

/** 보드의 제품 목록 (글 많은 순) */
export async function listBoardProducts(categoryId: number, page = 1, pageSize = 30): Promise<{ items: ProductListItem[]; hasMore: boolean }> {
  const key = `${categoryId}:${page}:${pageSize}`;
  const hitC = boardListCache.get(key);
  if (hitC && Date.now() - hitC.at < BOARD_LIST_TTL_MS) return hitC.value;
  const value = await listBoardProductsUncached(categoryId, page, pageSize);
  if (boardListCache.size > 500) boardListCache.clear();
  boardListCache.set(key, { at: Date.now(), value });
  return value;
}

/** 테스트용 */
export function clearBoardProductsCache() {
  boardListCache.clear();
}

async function listBoardProductsUncached(categoryId: number, page: number, pageSize: number): Promise<{ items: ProductListItem[]; hasMore: boolean }> {
  const rows = await query<ProductListItem>(
    `SELECT pr.id::text, pr.brand, pr.name, v.post_count,
            (SELECT count(*)::int FROM product_facts f JOIN posts p2 ON p2.id = f.post_id
              WHERE f.product_id = pr.id AND NOT p2.is_blinded AND NOT p2.is_suppressed) AS fact_count
       FROM (SELECT pp.product_id, count(*)::int AS post_count
               FROM post_products pp JOIN posts p ON p.id = pp.post_id JOIN products x ON x.id = pp.product_id
              WHERE x.category_id = $1 AND ${VISIBLE}
              GROUP BY pp.product_id) v
       JOIN products pr ON pr.id = v.product_id
      ORDER BY v.post_count DESC, pr.brand, pr.name, pr.id
      LIMIT $2 OFFSET $3`,
    [categoryId, pageSize + 1, (Math.max(1, page) - 1) * pageSize],
  );
  return { items: rows.slice(0, pageSize), hasMore: rows.length > pageSize };
}

/** sitemap 용: 보이는 글이 있는 제품 */
export async function listProductIdsForSitemap(limit = 5000): Promise<{ id: string; updated_at: string }[]> {
  return query(
    `SELECT pp.product_id::text AS id, max(p.updated_at) AS updated_at
       FROM post_products pp JOIN posts p ON p.id = pp.post_id
      WHERE ${VISIBLE} AND p.post_type <> 'chat'
      GROUP BY pp.product_id ORDER BY pp.product_id DESC LIMIT $1`,
    [limit],
  );
}

export type CompareRow = {
  key: string;
  attribute: string;
  basis: string;
  unit: string;
  /** products 순서대로 — 값이 없으면 null */
  cells: ({ label: number | null; measured: number | null; n: number } | null)[];
};

/** 2~3개 제품의 수치를 같은 항목·기준·단위로 맞춰 한 표로 */
export async function compareProducts(products: Product[]): Promise<CompareRow[]> {
  const rows = await factRows(products.map((p) => p.id));
  const per = products.map((p) => aggregateFacts(rows.filter((r) => r.product_id === p.id)));
  // 제품마다 환산 단위가 다를 수 있어 행 단위를 전체에서 가장 많이 쓴 단위로 다시 맞춘다
  const all = aggregateFacts(rows);
  return all
    .map((g) => ({
      key: g.key,
      attribute: g.attribute,
      basis: g.basis,
      unit: g.unit,
      cells: per.map((groups) => {
        const mine = groups.find((x) => x.key === g.key);
        if (!mine) return null;
        const conv = (v: number) => fromBase(toBase(v, mine.unit).base, g.unit);
        return {
          label: mine.label ? conv(mine.label.median) : null,
          measured: mine.measured ? conv(mine.measured.median) : null,
          n: mine.entries.length,
        };
      }),
    }))
    .sort((a, b) => b.cells.filter(Boolean).length - a.cells.filter(Boolean).length);
}

export { FACT_KIND_LABEL };
