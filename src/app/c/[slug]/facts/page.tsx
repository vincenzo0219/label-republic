import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { config } from "@/lib/config";
import { numParam } from "@/lib/fact-query";
import { FACT_KIND_LABEL, formatValue, normalizeUnit, validUnit } from "@/lib/products";
import { getCategoryBySlug as getCategoryUncached } from "@/lib/repo/categories";
import { listBoardAttributes, rankProducts, resolveAttribute } from "@/lib/repo/facts";

export const dynamic = "force-dynamic";

const getCategoryBySlug = cache(getCategoryUncached);
const getAttributes = cache(listBoardAttributes);

type SP = Record<string, string | undefined>;
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SP> };

function decodeSlug(raw: string) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

const FILTER_KEYS = ["basis", "kind", "min", "max", "unit", "order"] as const;

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const category = await getCategoryBySlug(decodeSlug((await params).slug));
  if (!category) return {};
  const sp = await searchParams;
  const base = `/c/${encodeURIComponent(category.slug)}/facts`;
  const attr = sp.attr ? resolveAttribute(await getAttributes(category.id), sp.attr) : null;
  if (!attr) {
    return { title: `${category.name} 성분·수치 순위`, description: `${category.name} 보드 글에 모인 제품 성분·스펙 수치를 항목별로 비교합니다.`, alternates: { canonical: base } };
  }
  // 조건을 건 결과는 색인하지 않고, 항목별 기본 순위만 색인
  const filtered = FILTER_KEYS.some((k) => sp[k]);
  return {
    title: `${attr.attribute} 함량·수치 순위 — ${category.name}`,
    description: `${category.name} 제품 ${attr.products}개의 ${attr.attribute} 수치를 커뮤니티 글에서 모아 많은 순으로 비교했습니다. 표시값과 실측값을 함께 봅니다.`,
    alternates: { canonical: `${base}?attr=${encodeURIComponent(attr.attr_key)}` },
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function FactsPage({ params, searchParams }: Props) {
  const category = await getCategoryBySlug(decodeSlug((await params).slug));
  if (!category) notFound();
  const sp = await searchParams;
  const boardPath = `/c/${encodeURIComponent(category.slug)}`;
  const attrs = await getAttributes(category.id);
  const attr = sp.attr ? resolveAttribute(attrs, sp.attr) : null;

  const unitRaw = sp.unit?.trim() ? normalizeUnit(sp.unit) : undefined;
  const unit = unitRaw && validUnit(unitRaw) ? unitRaw : undefined;
  const min = numParam(sp.min);
  const max = numParam(sp.max);
  const order = sp.order === "asc" ? "asc" : "desc";
  const result = attr
    ? await rankProducts({
        categoryId: category.id,
        attrKey: attr.attr_key,
        basisKey: sp.basis,
        kind: sp.kind === "measured" ? "measured" : "label",
        unit,
        min,
        max,
        order,
      })
    : null;

  const jsonLd = result && {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${result.attribute} 순위 (${result.basis || "기준 없음"}, ${FACT_KIND_LABEL[result.kind]})`,
    itemListOrder: order === "desc" ? "https://schema.org/ItemListOrderDescending" : "https://schema.org/ItemListOrderAscending",
    itemListElement: result.items.slice(0, 20).map((r, i) => ({ "@type": "ListItem", position: i + 1, name: `${r.brand} ${r.name}`, url: `${config.siteUrl}/p/${r.id}` })),
  };

  return (
    <>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />}
      <p className="hint">
        <Link href={boardPath}>← {category.name}</Link> · <Link href={`${boardPath}/products`}>제품 목록</Link>
      </p>
      <h1 style={{ fontSize: 20, margin: "4px 0 12px" }}>🧪 {attr ? `${attr.attribute} 순위` : `${category.name} 성분·수치`}</h1>

      {attrs.length === 0 ? (
        <div className="empty">
          <p>아직 수치를 적은 글이 없습니다. 글을 쓸 때 제품을 태그하고 성분 함량·스펙을 적으면 여기서 비교할 수 있어요.</p>
        </div>
      ) : (
        <nav className="attr-chips" aria-label="수치 항목">
          {attrs.slice(0, 40).map((a) => (
            <Link key={a.attr_key} className="chip chip-sm" href={`${boardPath}/facts?attr=${encodeURIComponent(a.attr_key)}`} aria-current={attr?.attr_key === a.attr_key ? "true" : undefined}>
              {a.attribute} <span className="hint">{a.products}</span>
            </Link>
          ))}
        </nav>
      )}

      {attr && result && (
        <>
          <form className="fact-filter" action={`${boardPath}/facts`} method="get" aria-label="수치 조건">
            <input type="hidden" name="attr" value={attr.attr_key} />
            <label className="field">
              <span>기준</span>
              <select className="select input-sm" name="basis" defaultValue={result.basis_key}>
                {result.bases.map((b) => (
                  <option key={b.basis_key} value={b.basis_key}>
                    {b.basis || "기준 없음"} ({b.products})
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="field fact-kind">
              <legend>값</legend>
              {(["label", "measured"] as const).map((k) => (
                <label key={k} className="radio">
                  <input type="radio" name="kind" value={k} defaultChecked={result.kind === k} /> {FACT_KIND_LABEL[k]}
                </label>
              ))}
            </fieldset>
            <div className="fact-range">
              <label className="field">
                <span>최소</span>
                <input className="input input-sm" name="min" inputMode="decimal" defaultValue={sp.min ?? ""} />
              </label>
              <label className="field">
                <span>최대</span>
                <input className="input input-sm" name="max" inputMode="decimal" defaultValue={sp.max ?? ""} />
              </label>
              <label className="field">
                <span>단위</span>
                <input className="input input-sm" name="unit" defaultValue={unit ?? result.unit} maxLength={12} />
              </label>
            </div>
            <label className="field">
              <span>정렬</span>
              <select className="select input-sm" name="order" defaultValue={order}>
                <option value="desc">많은 순</option>
                <option value="asc">적은 순</option>
              </select>
            </label>
            <button className="btn btn-sm btn-primary">적용</button>
          </form>

          <p className="hint" role="status">
            {result.basis ? `${result.basis} 기준` : "기준 없음"} · {FACT_KIND_LABEL[result.kind]} 중앙값 · 조건에 맞는 제품 {result.items.length}
            {result.items.length < result.total || min !== undefined || max !== undefined ? ` / 전체 ${result.total}` : ""}
            {result.kind_fallback && ` · ${FACT_KIND_LABEL[result.kind === "label" ? "measured" : "label"]}이 없어 ${FACT_KIND_LABEL[result.kind]}으로 보여드려요`}
          </p>
          {result.unit_mismatch && (
            <p className="notice" role="alert">
              {unit} 단위로는 이 항목의 수치와 비교할 수 없어요 (예: IU와 mg은 성분마다 환산이 달라요). 단위를 비우거나 바꿔 보세요.
            </p>
          )}

          {result.items.length > 0 && (
            <form id="cmp" action="/compare" method="get">
              <div className="table-scroll" role="region" aria-label={`${result.attribute} 순위 표`} tabIndex={0}>
                <table className="data-table rank-table">
                  <thead>
                    <tr>
                      <th scope="col" className="num">#</th>
                      <th scope="col">제품</th>
                      <th scope="col" className="num">
                        {FACT_KIND_LABEL[result.kind]} ({result.unit})
                      </th>
                      <th scope="col" className="num">{FACT_KIND_LABEL[result.kind === "label" ? "measured" : "label"]}</th>
                      <th scope="col" className="num">글</th>
                      <th scope="col">
                        <span className="sr-only">비교</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.map((r, i) => {
                      const other = result.kind === "label" ? r.measured : r.label;
                      const gap = r.diff_pct !== null && Math.abs(r.diff_pct) >= 10;
                      return (
                        <tr key={r.id}>
                          <td className="num">{i + 1}</td>
                          <th scope="row">
                            <Link href={`/p/${r.id}`}>
                              <span className="product-brand">{r.brand}</span> {r.name}
                            </Link>
                          </th>
                          <td className="num">
                            <b>{formatValue(r.value)}</b>
                          </td>
                          <td className="num">
                            {other === null ? <span className="hint">-</span> : formatValue(other)}
                            {gap && (
                              <span className="diff diff-notable" title="실측이 표시와 10% 이상 다름">
                                {" "}
                                ⚠ {r.diff_pct! > 0 ? "+" : ""}
                                {Math.round(r.diff_pct!)}%
                              </span>
                            )}
                          </td>
                          <td className="num">{r.posts}</td>
                          <td>
                            <input type="checkbox" name="ids" value={r.id} aria-label={`${r.brand} ${r.name} 비교에 넣기`} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="rank-actions">
                <button className="btn btn-sm">⚖ 선택한 제품 비교 (최대 3개)</button>
              </div>
            </form>
          )}
          <p className="hint">
            값은 각 제품 글들의 중앙값입니다. mg·µg·g처럼 바꿔 계산할 수 있는 단위는 맞춰서 비교하고, 기준(1정, 1일 섭취량 등)이 다른 값은 섞지 않습니다. 블라인드·광고
            의심 글과 커뮤니티가 동의한 정정 제안이 걸린 값은 빠집니다. 수치는 이용자가 적은 값이며 의학적 조언이 아닙니다.
          </p>
        </>
      )}
      {!attr && attrs.length > 0 && <p className="hint">항목을 누르면 그 수치가 많은(또는 적은) 제품 순으로 볼 수 있어요. 검색창에 &ldquo;마그네슘 200mg 이상&rdquo;처럼 적어도 됩니다.</p>}
    </>
  );
}
