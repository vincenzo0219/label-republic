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
import { detectEras, DEFAULT_MIN_REPORTS, type LabelReport } from "../renewals";
import { productionTimeIndex, readLabelDates, type TimeBasis } from "../label-dates";
import type { PostProductDates } from "../types";
import { resolveDateEvidence, resolveEvidence } from "./label-reads";
import { getRule } from "./rules";

/** 제품 태그 + 라벨 날짜 (Sprint 26, 선택) */
export type ProductDateInput = { made?: string; expires?: string; dateImage?: string; dateFromLabel?: boolean };
export type ProductRef = ({ id: string } | { brand: string; name: string }) & ProductDateInput;
/** product: 같은 요청의 제품 목록에서의 순서 (0부터) */
export type FactInput = { product: number; attribute: string; value: number; unit: string; basis?: string; kind: FactKind; image?: string; fromLabel?: boolean };

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
    // 라벨 날짜: 같은 제품을 두 번 적었으면 먼저 적은 쪽 (Sprint 26)
    const i = ids.indexOf(id);
    const ref = refs[i]!;
    const parsed = readLabelDates(ref.made ?? "", ref.expires ?? "");
    if ("problem" in parsed) throw badProduct(`${i + 1}번째 제품: ${parsed.problem}`);
    const { made, expires } = parsed;
    const ev = made || expires
      ? await resolveDateEvidence(client, postId, { image: ref.dateImage, fromLabel: ref.dateFromLabel, made, expires }, i)
      : { image: null, origin: "manual" as const };
    const day = (d: typeof made) => (d ? (d.precision === "month" ? `${d.iso}-01` : d.iso) : null);
    await client.query(
      `INSERT INTO post_products (post_id, product_id, position, made_on, made_precision, expires_on, expires_precision, date_origin, date_image)
       VALUES ($1, $2, $3, $4::date, $5, $6::date, $7, $8, $9)
       ON CONFLICT (post_id, product_id) DO UPDATE SET position = EXCLUDED.position,
         made_on = EXCLUDED.made_on, made_precision = EXCLUDED.made_precision, expires_on = EXCLUDED.expires_on,
         expires_precision = EXCLUDED.expires_precision, date_origin = EXCLUDED.date_origin, date_image = EXCLUDED.date_image`,
      [postId, id, position, day(made), made?.precision ?? null, day(expires), expires?.precision ?? null, ev.origin, ev.image],
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
  // 근거 사진·출처 (Sprint 20) — 사진은 먼저 글에 붙어 있어야 한다
  const evidence = await resolveEvidence(client, postId, facts);
  await client.query("DELETE FROM product_facts WHERE post_id = $1", [postId]);
  for (const [position, r] of rows.entries()) {
    const ev = evidence[position]!;
    await client.query(
      `INSERT INTO product_facts (post_id, product_id, position, attribute, attr_key, value, unit, basis, kind, basis_key, unit_group, base_value, source_image_id, origin)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [postId, r.productId, position, r.attribute, r.key, r.value, r.unit, r.basis, r.kind, normText(r.basis).slice(0, 30), toBase(r.value, r.unit).group, toBase(r.value, r.unit).base, ev.image, ev.origin],
    );
  }
}

/** 글에 태그한 제품의 라벨 날짜 (적은 제품만, 태그 순서) */
export async function listPostProductDates(postId: string): Promise<PostProductDates[]> {
  if (!ID.test(postId)) return [];
  const rows = await query<{ product_id: string; made: string | null; mp: "day" | "month" | null; expires: string | null; ep: "day" | "month" | null; origin: PostProductDates["origin"]; image: string | null }>(
    `SELECT product_id::text, to_char(made_on, 'YYYY-MM-DD') AS made, made_precision AS mp, to_char(expires_on, 'YYYY-MM-DD') AS expires,
            expires_precision AS ep, date_origin AS origin, date_image::text AS image
       FROM post_products WHERE post_id = $1 AND (made_on IS NOT NULL OR expires_on IS NOT NULL) ORDER BY position`,
    [postId],
  );
  const d = (iso: string | null, p: "day" | "month" | null) => (iso && p ? { iso: p === "month" ? iso.slice(0, 7) : iso, precision: p } : null);
  return rows.map((r) => ({ product_id: r.product_id, made: d(r.made, r.mp), expires: d(r.expires, r.ep), origin: r.origin, image: r.image }));
}

export async function listPostFacts(postId: string): Promise<PostFact[]> {
  if (!ID.test(postId)) return [];
  return query<PostFact>(
    `SELECT product_id::text, attribute, value::float8 AS value, unit, basis, kind, source_image_id::text AS image, origin
       FROM product_facts WHERE post_id = $1 ORDER BY position`,
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

export type FactEntry = {
  post_id: string; value: number; unit: string; kind: FactKind; disputed: boolean; photo?: boolean;
  /** 리뉴얼 전 라벨 시기의 글 (Sprint 25) — 지금 값 집계에서 빠짐 */
  old?: boolean;
};

/** 리뉴얼로 나뉜 라벨 시기 (Sprint 25). 값은 묶음 표시 단위 */
export type LabelEra = {
  value: number; n: number; authors: number; photos: number;
  /** 이 시기 대표 값의 첫·마지막 제보의 추정 제조 시각 (Sprint 26) */
  first_at: number; last_at: number;
  /** 그 시각을 무엇으로 잡았는지 — made/expires(라벨 날짜) 또는 posted(글 올린 시각) */
  first_basis: TimeBasis; last_basis: TimeBasis;
};
/** 최근 제보가 지금 라벨과 다르지만 아직 기준 수 미만 */
export type LabelPending = { from: number; to: number; n: number; authors: number; photos: number; needed: number; post_ids: string[] };
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
  /** 라벨이 바뀐 적이 있으면 시기별 값 (오래된 것부터, 마지막이 지금). 없으면 null */
  eras: LabelEra[] | null;
  /** 지금 라벨 시기가 시작된 시각 — 이 전 글의 값은 집계에서 뺀다 */
  current_since: number | null;
  pending: LabelPending | null;
};

type FactRow = {
  product_id: string; post_id: string; attribute: string; attr_key: string; value: number; unit: string; basis: string; kind: FactKind;
  /** 커뮤니티가 동의한 정정 제안이 걸린 수치 — 집계(중앙값)에서 뺀다 */
  disputed?: boolean;
  /** 근거 사진이 있는지 (Sprint 20) */
  has_photo?: boolean;
  /** 글이 올라온 시각(ms)·작성자 식별값 — 리뉴얼 감지용 (Sprint 25) */
  at?: number;
  author?: string | null;
  /** 라벨 날짜(ms, Sprint 26)·보드 — 추정 제조 시각 계산용 */
  made?: number | null;
  expires?: number | null;
  board?: string;
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

/**
 * 글별 수치를 항목·기준·단위 묶음별로 모은다. 같은 묶음 안의 mg/µg/g 는 가장 많이 쓴 단위로 환산한다.
 * 표시값이 시기에 따라 바뀌었으면(리뉴얼, src/lib/renewals.ts) 지금 라벨 시기의 글만으로 표시값·실측값을 낸다.
 */
export function aggregateFacts(rows: FactRow[], minReports = DEFAULT_MIN_REPORTS): FactGroup[] {
  // 리뉴얼 판단의 시점: 라벨 날짜로 추정한 제조 시각 (없으면 글 올린 시각에서 보정, src/lib/label-dates.ts)
  const ptime = productionTimeIndex(rows);
  const timeOf = (r: FactRow) => ptime.get(`${r.product_id}|${r.post_id}`);
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
    // 리뉴얼 감지: 정정 제안이 걸리지 않은 표시값을 추정 제조 시각 순으로
    const reports: LabelReport[] = g.rows
      .filter((r) => r.kind === "label" && !r.disputed && timeOf(r))
      .map((r) => ({ post_id: r.post_id, at: timeOf(r)!.at, base: r.base, author: r.author ?? null, photo: !!r.has_photo }));
    const basisOf = (postId: string): TimeBasis => ptime.get(`${g.rows[0]!.product_id}|${postId}`)?.basis ?? "posted";
    const { eras, pending } = reports.length >= 2 ? detectEras(reports, minReports) : { eras: [], pending: null };
    const renewed = eras.length >= 2;
    const since = renewed ? eras[eras.length - 1]!.start_at : null;
    const isOld = (r: FactRow & { base: number }) => since !== null && (timeOf(r)?.at ?? 0) < since;
    const stat = (kind: FactKind) => {
      const vs = g.rows.filter((r) => r.kind === kind && !r.disputed && !isOld(r)).map((r) => fromBase(r.base, unit));
      return vs.length ? { median: median(vs), n: vs.length } : null;
    };
    const lastEra = eras[eras.length - 1];
    // 지금 라벨 값은 지금 시기의 대표 값 (옛 재고 제보가 조금 섞여도 흔들리지 않게)
    const label = renewed && lastEra ? { median: fromBase(lastEra.base, unit), n: lastEra.n } : stat("label");
    const measured = stat("measured");
    out.push({
      key,
      attribute: mostCommon(g.rows.map((r) => r.attribute)),
      basis: mostCommon(g.rows.map((r) => r.basis)),
      unit,
      label,
      measured,
      diff_pct: label && measured && label.median > 0 ? ((measured.median - label.median) / label.median) * 100 : null,
      entries: g.rows.map((r) => ({ post_id: r.post_id, value: fromBase(r.base, unit), unit, kind: r.kind, disputed: !!r.disputed, photo: !!r.has_photo, old: isOld(r) })),
      disputed_n: g.rows.filter((r) => r.disputed).length,
      eras: renewed
        ? eras.map((e) => ({
            value: fromBase(e.base, unit), n: e.n, authors: e.authors, photos: e.photos, first_at: e.first_at, last_at: e.last_at,
            first_basis: basisOf(e.post_ids[0]!), last_basis: basisOf(e.post_ids[e.post_ids.length - 1]!),
          }))
        : null,
      current_since: since,
      pending: pending
        ? {
            from: fromBase(pending.from, unit), to: fromBase(pending.to, unit), n: pending.n, authors: pending.authors, photos: pending.photos,
            needed: Math.max(0, Math.max(2, Math.round(minReports)) - pending.authors), post_ids: pending.post_ids,
          }
        : null,
    });
  }
  // 글이 많이 적은 항목부터
  return out.sort((a, b) => b.entries.length - a.entries.length || a.attribute.localeCompare(b.attribute, "ko"));
}

/** post_products(pp) 의 라벨 날짜 → ms (월까지만이면 15일 — src/lib/label-dates.ts labelDateMs 와 같음) */
export const LABEL_DATE_MS = `(extract(epoch FROM pp.made_on + CASE WHEN pp.made_precision = 'month' THEN 14 ELSE 0 END) * 1000)::float8 AS made,
            (extract(epoch FROM pp.expires_on + CASE WHEN pp.expires_precision = 'month' THEN 14 ELSE 0 END) * 1000)::float8 AS expires`;

async function factRows(productIds: string[]): Promise<FactRow[]> {
  return query<FactRow>(
    `SELECT f.product_id::text, f.post_id::text, f.attribute, f.attr_key, f.value::float8 AS value, f.unit, f.basis, f.kind,
            f.source_image_id IS NOT NULL AS has_photo,
            (extract(epoch FROM p.created_at) * 1000)::float8 AS at, p.author_fingerprint AS author,
            ${LABEL_DATE_MS}, c.slug AS board,
            p.disputed_count > 0 AND EXISTS (
              SELECT 1 FROM corrections c
               WHERE c.post_id = f.post_id AND c.target = 'fact' AND c.status IN ('open', 'answered') AND c.is_supported AND NOT c.is_hidden
                 AND c.fact_product_id = f.product_id AND c.fact_attr_key = f.attr_key AND c.fact_kind = f.kind
                 AND c.fact_value = f.value AND c.fact_unit = f.unit AND c.fact_basis = f.basis) AS disputed
       FROM product_facts f JOIN posts p ON p.id = f.post_id
       JOIN post_products pp ON pp.post_id = f.post_id AND pp.product_id = f.product_id
       JOIN products pr ON pr.id = f.product_id JOIN categories c ON c.id = pr.category_id
      WHERE f.product_id = ANY($1::bigint[]) AND ${VISIBLE}
      ORDER BY f.post_id DESC, f.position
      LIMIT 2000`,
    [productIds],
  );
}

export async function productFacts(productId: string): Promise<FactGroup[]> {
  const [rows, min] = await Promise.all([factRows([productId]), getRule("renewal_min_reports")]);
  return aggregateFacts(rows, min);
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
  cells: ({ label: number | null; measured: number | null; n: number; renewed?: boolean } | null)[];
};

/** 2~3개 제품의 수치를 같은 항목·기준·단위로 맞춰 한 표로 */
export async function compareProducts(products: Product[]): Promise<CompareRow[]> {
  const [rows, min] = await Promise.all([factRows(products.map((p) => p.id)), getRule("renewal_min_reports")]);
  // 제품마다 리뉴얼 뒤 지금 라벨 값으로 (Sprint 25)
  const per = products.map((p) => aggregateFacts(rows.filter((r) => r.product_id === p.id), min));
  // 제품마다 환산 단위가 다를 수 있어 행 단위를 전체에서 가장 많이 쓴 단위로 다시 맞춘다 (행 목록·단위만 쓰므로 리뉴얼 계산 불필요)
  const all = aggregateFacts(rows.map(({ at: _at, ...r }) => r));
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
          renewed: mine.eras !== null,
        };
      }),
    }))
    .sort((a, b) => b.cells.filter(Boolean).length - a.cells.filter(Boolean).length);
}

export { FACT_KIND_LABEL };
