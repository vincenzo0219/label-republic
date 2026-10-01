/**
 * 성분·수치 검색 (Sprint 17). 방 안에서 "항목 · 기준 · 단위 묶음"이 같은 수치끼리 제품별로 모아
 * 순위와 범위 조건으로 찾는다. 제품 페이지(Sprint 14)와 같은 규칙: 보이는 글만, 동의된 정정 제안이 걸린 값은 제외, 중앙값.
 */
import { query } from "../db";
import { attrKey, fromBase, normText, toBase, type FactKind } from "../products";

const VISIBLE = "NOT p.is_blinded AND NOT p.is_suppressed";
// 동의된 정정 제안이 걸린 값 제외. 부분 인덱스(corrections_fact_idx) 대상과 같은 조건의 반조인으로 쓴다
// ("disputed_count > 0 AND EXISTS" 꼴로 쓰면 플래너가 글 전체를 해시 조인해 10배 느려진다)
export const NOT_DISPUTED = `NOT EXISTS (
  SELECT 1 FROM corrections c
   WHERE c.post_id = f.post_id AND c.target = 'fact' AND c.status IN ('open', 'answered') AND c.is_supported AND NOT c.is_hidden
     AND c.fact_product_id = f.product_id AND c.fact_attr_key = f.attr_key AND c.fact_kind = f.kind
     AND c.fact_value = f.value AND c.fact_unit = f.unit AND c.fact_basis = f.basis)`;

// 리뉴얼(Sprint 25)이 확인된 항목은 리뉴얼 뒤 글의 값만 — 제품 페이지의 "지금 라벨"과 같은 기준.
// 기록은 정리 배치가 src/lib/renewals.ts 로 계산해 남긴다 (최대 5분 늦을 수 있음). 어느 글이 이전 시기인지는
// 라벨 날짜로 추정한 제조 시각으로 정하므로(Sprint 26) 글 목록(old_posts)으로 뺀다 — 기록 뒤에 올라온 글은 지금 시기로 본다
const CURRENT_LABEL_ERA = `NOT EXISTS (
  SELECT 1 FROM product_renewals r
   WHERE r.product_id = f.product_id AND r.attr_key = f.attr_key AND r.basis_key = f.basis_key AND r.unit_group = f.unit_group
     AND r.status = 'confirmed' AND f.post_id = ANY(r.old_posts))`;

// 방 전체 수치를 훑는 조회라 인스턴스별로 잠깐 캐시한다 (새 수치는 1분 안에 반영)
const TTL_MS = 60_000;
// 라우트 핸들러(운영자 확정 뒤 비우기)와 페이지 번들이 이 모듈을 따로 불러오므로 globalThis 에 하나만 둔다 (Sprint 35 E2E 에서 발견:
// 확정 뒤에도 페이지는 1분 동안 옛 항목 목록을 봤다)
const g = globalThis as unknown as { __labelRepFactCache?: Map<string, { at: number; value: unknown }> };
const cache = (g.__labelRepFactCache ??= new Map());
async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const value = await fn();
  if (cache.size > 1000) cache.clear();
  cache.set(key, { at: Date.now(), value });
  return value;
}
export function clearFactCache() {
  cache.clear();
}

export type BasisSummary = { basis_key: string; basis: string; products: number };
export type AttributeSummary = {
  attr_key: string;
  attribute: string;
  products: number;
  bases: BasisSummary[];
  /** 이 항목으로 합쳐진 다른 이름의 키 (성분명 별칭, Sprint 35) — 검색어가 옛 이름이어도 찾는다 */
  aliases: string[];
};

/** 방에 있는 수치 항목 (제품 많은 순) */
export async function listBoardAttributes(categoryId: number): Promise<AttributeSummary[]> {
  return cached(`attrs:${categoryId}`, async () => {
    const rows = await query<{ attr_key: string; attribute: string; basis_key: string; basis: string; products: number }>(
      `SELECT f.attr_key, mode() WITHIN GROUP (ORDER BY f.attribute) AS attribute,
              f.basis_key, mode() WITHIN GROUP (ORDER BY f.basis) AS basis, count(DISTINCT f.product_id)::int AS products
         FROM product_facts f JOIN posts p ON p.id = f.post_id JOIN products pr ON pr.id = f.product_id
        WHERE pr.category_id = $1 AND pr.merged_into IS NULL AND ${VISIBLE}
        GROUP BY f.attr_key, f.basis_key`,
      [categoryId],
    );
    const [aliasRows, names] = await Promise.all([
      query<{ alias_key: string; canonical_key: string }>("SELECT alias_key, canonical_key FROM attr_aliases WHERE category_id = $1", [categoryId]),
      // 항목마다 쓰인 이름과 횟수 — 합쳐진 항목은 대표 키와 같은 이름을 먼저 보여 준다 ("Vitamin D3" 보다 "비타민 D", Sprint 35)
      query<{ attr_key: string; attribute: string; n: number }>(
        `SELECT f.attr_key, f.attribute, count(*)::int AS n
           FROM product_facts f JOIN posts p ON p.id = f.post_id JOIN products pr ON pr.id = f.product_id
          WHERE pr.category_id = $1 AND pr.merged_into IS NULL AND ${VISIBLE}
          GROUP BY 1, 2`,
        [categoryId],
      ),
    ]);
    const byAttr = new Map<string, AttributeSummary>();
    for (const r of rows) {
      const a = byAttr.get(r.attr_key) ?? { attr_key: r.attr_key, attribute: r.attribute, products: 0, bases: [], aliases: [] };
      a.bases.push({ basis_key: r.basis_key, basis: r.basis, products: r.products });
      byAttr.set(r.attr_key, a);
    }
    for (const al of aliasRows) byAttr.get(al.canonical_key)?.aliases.push(al.alias_key);
    for (const a of byAttr.values()) {
      a.bases.sort((x, y) => y.products - x.products);
      // 기준이 여러 개인 제품은 두 번 셀 수 있지만 순서를 정하는 데는 충분하다
      a.products = Math.max(...a.bases.map((b) => b.products));
      const used = names.filter((r) => r.attr_key === a.attr_key).sort((x, y) => y.n - x.n || x.attribute.localeCompare(y.attribute, "ko"));
      a.attribute = (used.find((r) => attrKey(r.attribute) === a.attr_key) ?? used[0])?.attribute ?? a.attribute;
    }
    return [...byAttr.values()].sort((a, b) => b.products - a.products || a.attribute.localeCompare(b.attribute, "ko"));
  });
}

/**
 * 검색어 속 항목 이름을 방의 항목 키로: 정확히 같으면 그것, 아니면 검색어에 들어 있는 가장 긴 항목
 * ("마그네슘 1정" → "마그네슘"), 그다음 검색어로 시작하는 항목 ("비타민" → "비타민d").
 */
export function resolveAttribute(attrs: AttributeSummary[], text: string): AttributeSummary | null {
  const key = attrKey(text);
  if (!key) return null;
  // 항목의 대표 키와 합쳐진 다른 이름(별칭)을 모두 이름으로 본다 ("vitamin d3" → 비타민d)
  const names = attrs.flatMap((a) => [a.attr_key, ...(a.aliases ?? [])].map((k) => ({ a, k })));
  return (
    names.find((n) => n.k === key)?.a ??
    names.filter((n) => key.includes(n.k) && n.k.length >= 2).sort((x, y) => y.k.length - x.k.length)[0]?.a ??
    names.filter((n) => n.k.startsWith(key)).sort((x, y) => y.a.products - x.a.products)[0]?.a ??
    null
  );
}

export type RankParams = {
  categoryId: number;
  attrKey: string;
  basisKey?: string;
  kind?: FactKind;
  /** 조건·표시 단위. 없으면 가장 많이 쓴 단위 */
  unit?: string;
  min?: number;
  max?: number;
  order?: "desc" | "asc";
  limit?: number;
};

export type RankRow = {
  id: string;
  brand: string;
  name: string;
  /** 순위 기준 값 (unit 단위) */
  value: number;
  label: number | null;
  measured: number | null;
  n_label: number;
  n_measured: number;
  posts: number;
  diff_pct: number | null;
};

export type RankResult = {
  attribute: string;
  attr_key: string;
  basis: string;
  basis_key: string;
  bases: BasisSummary[];
  unit: string;
  kind: FactKind;
  /** 선택한 표시값/실측값이 없어 다른 쪽으로 바꿨으면 true */
  kind_fallback: boolean;
  /** 조건 단위를 이 항목 수치로 바꿔 계산할 수 없음 (예: IU ↔ mg) */
  unit_mismatch: boolean;
  /** 조건 없이 이 항목·기준에 값이 있는 제품 수 */
  total: number;
  items: RankRow[];
};

type Agg = {
  product_id: string; brand: string; name: string; unit_group: string; unit: string;
  label_base: number | null; measured_base: number | null; n_label: number; n_measured: number; posts: number;
};

async function aggregate(categoryId: number, attr: string, basisKey: string): Promise<Agg[]> {
  return cached(`agg:${categoryId}:${attr}:${basisKey}`, () =>
    query<Agg>(
      `SELECT f.product_id::text, pr.brand, pr.name, f.unit_group, mode() WITHIN GROUP (ORDER BY f.unit) AS unit,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY f.base_value) FILTER (WHERE f.kind = 'label') AS label_base,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY f.base_value) FILTER (WHERE f.kind = 'measured') AS measured_base,
              count(*) FILTER (WHERE f.kind = 'label')::int AS n_label,
              count(*) FILTER (WHERE f.kind = 'measured')::int AS n_measured,
              count(DISTINCT f.post_id)::int AS posts
         FROM product_facts f JOIN posts p ON p.id = f.post_id JOIN products pr ON pr.id = f.product_id
        WHERE f.attr_key = $2 AND f.basis_key = $3 AND pr.category_id = $1 AND pr.merged_into IS NULL
          AND ${VISIBLE} AND ${NOT_DISPUTED} AND ${CURRENT_LABEL_ERA}
        GROUP BY f.product_id, pr.brand, pr.name, f.unit_group`,
      [categoryId, attr, basisKey],
    ),
  );
}

function mostCommon<T>(xs: T[]): T | undefined {
  const m = new Map<T, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

export async function rankProducts(p: RankParams): Promise<RankResult | null> {
  const attrs = await listBoardAttributes(p.categoryId);
  const attr = attrs.find((a) => a.attr_key === p.attrKey);
  if (!attr) return null;
  const basis = attr.bases.find((b) => b.basis_key === normText(p.basisKey ?? "")) ?? attr.bases[0]!;
  const rows = await aggregate(p.categoryId, attr.attr_key, basis.basis_key);

  // 단위 묶음: 조건 단위가 있으면 그 묶음, 없으면 제품이 가장 많은 묶음
  // 비타민 D 는 IU 조건으로도 µg 값과 비교한다 (Sprint 35)
  const wanted = p.unit ? toBase(1, p.unit, attr.attr_key).group : mostCommon(rows.map((r) => r.unit_group));
  const inGroup = rows.filter((r) => r.unit_group === wanted);
  const unitMismatch = Boolean(p.unit) && inGroup.length === 0 && rows.length > 0;
  const unit = p.unit ?? mostCommon(inGroup.map((r) => r.unit)) ?? "";

  let kind: FactKind = p.kind ?? "label";
  let kindFallback = false;
  if (!inGroup.some((r) => (kind === "label" ? r.label_base : r.measured_base) !== null)) {
    const other: FactKind = kind === "label" ? "measured" : "label";
    if (inGroup.some((r) => (other === "label" ? r.label_base : r.measured_base) !== null)) {
      kind = other;
      kindFallback = true;
    }
  }

  const conv = (b: number | null) => (b === null ? null : fromBase(b, unit, attr.attr_key));
  const all: RankRow[] = inGroup.flatMap((r) => {
    const base = kind === "label" ? r.label_base : r.measured_base;
    if (base === null) return [];
    const label = conv(r.label_base);
    const measured = conv(r.measured_base);
    return [{
      id: r.product_id, brand: r.brand, name: r.name, value: fromBase(base, unit, attr.attr_key), label, measured,
      n_label: r.n_label, n_measured: r.n_measured, posts: r.posts,
      diff_pct: label && measured !== null && label > 0 ? ((measured - label) / label) * 100 : null,
    }];
  });
  // 조건 비교는 부동소수 오차를 조금 봐준다 (0.1 g → 100 mg)
  const eps = (v: number) => Math.abs(v) * 1e-9 + 1e-9;
  const items = all
    .filter((r) => (p.min === undefined || r.value >= p.min - eps(p.min)) && (p.max === undefined || r.value <= p.max + eps(p.max)))
    .sort((a, b) => (p.order === "asc" ? a.value - b.value : b.value - a.value) || b.posts - a.posts || Number(a.id) - Number(b.id))
    .slice(0, Math.min(p.limit ?? 100, 200));

  return {
    attribute: attr.attribute,
    attr_key: attr.attr_key,
    basis: basis.basis,
    basis_key: basis.basis_key,
    bases: attr.bases,
    unit,
    kind,
    kind_fallback: kindFallback,
    unit_mismatch: unitMismatch,
    total: all.length,
    items,
  };
}

/** 이 항목 키가 있는 방 번호 (검색어가 항목 이름일 때 모든 방을 훑지 않으려고) */
export async function boardsWithAttribute(key: string): Promise<Set<number>> {
  const byBoard = await attrKeysByBoard();
  return new Set([...byBoard.entries()].filter(([, keys]) => keys.has(key)).map(([id]) => id));
}

/** 방별 수치 항목 키와 합쳐진 다른 이름의 키 (보이는 글 여부는 보지 않는 가벼운 1차 필터) */
async function attrKeysByBoard(): Promise<Map<number, Set<string>>> {
  return cached("attrkeys", async () => {
    const rows = await query<{ category_id: number; attr_key: string }>(
      `SELECT DISTINCT pr.category_id, f.attr_key FROM product_facts f JOIN products pr ON pr.id = f.product_id WHERE pr.merged_into IS NULL
       UNION SELECT category_id, alias_key FROM attr_aliases`,
    );
    const m = new Map<number, Set<string>>();
    for (const r of rows) m.set(r.category_id, (m.get(r.category_id) ?? new Set()).add(r.attr_key));
    return m;
  });
}

export type BoardFactMatch = { category: { id: number; slug: string; name: string }; result: RankResult };

/** 검색어 조건으로 모든 방에서 찾기 (검색 결과 상단 패널) */
export async function searchFacts(
  categories: { id: number; slug: string; name: string }[],
  q: { attribute: string; min?: number; max?: number; unit?: string },
  perBoard = 5,
): Promise<BoardFactMatch[]> {
  // 항목 이름이 어느 방에 있는지 먼저 한 번에 거른다 (모든 방의 항목 목록을 매번 모으면 방 수만큼 느려진다)
  const byBoard = await attrKeysByBoard();
  const key = attrKey(q.attribute);
  const candidates = categories.filter((c) => [...(byBoard.get(c.id) ?? [])].some((k) => k === key || (key.includes(k) && k.length >= 2) || k.startsWith(key)));
  // 방마다 독립적인 조회라 동시에
  const found = await Promise.all(
    candidates.map(async (c): Promise<BoardFactMatch | null> => {
      const attr = resolveAttribute(await listBoardAttributes(c.id), q.attribute);
      if (!attr) return null;
      const result = await rankProducts({
        categoryId: c.id, attrKey: attr.attr_key, unit: q.unit, min: q.min, max: q.max,
        order: q.max !== undefined && q.min === undefined ? "asc" : "desc", limit: perBoard,
      });
      return result && (result.total > 0 || result.unit_mismatch) ? { category: c, result } : null;
    }),
  );
  return found.filter((x): x is BoardFactMatch => x !== null);
}

