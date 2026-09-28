import type { Metadata } from "next";
import Link from "next/link";
import { CompareAdd } from "@/components/CompareAdd";
import { formatValue } from "@/lib/products";
import { compareProducts, getProduct, type Product } from "@/lib/repo/products";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "제품 비교",
  description: "라벨공화국 글에 모인 성분·스펙 수치로 제품을 나란히 비교합니다.",
  robots: { index: false, follow: true },
};

const MAX_COMPARE = 3;

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** ?ids=1,2 또는 ?ids=1&ids=2 (보드 제품 목록의 체크박스 폼) */
function parseIds(raw: string | string[] | undefined): string[] {
  const list = (Array.isArray(raw) ? raw : [raw ?? ""]).flatMap((v) => v.split(","));
  return [...new Set(list.map((s) => s.trim()).filter((s) => /^\d{1,18}$/.test(s)))].slice(0, MAX_COMPARE);
}

function cell(v: number | null, unit: string) {
  return v === null ? null : `${formatValue(v)} ${unit}`;
}

export default async function ComparePage({ searchParams }: Props) {
  const ids = parseIds((await searchParams).ids);
  const found = await Promise.all(ids.map((id) => getProduct(id)));
  // 병합된 제품은 합쳐진 제품으로 바꿔 보여준다
  const resolved = await Promise.all(found.map((p) => (p && "redirect" in p ? getProduct(p.redirect) : p)));
  const products = resolved.filter((p): p is Product => !!p && !("redirect" in p)).filter((p, i, all) => all.findIndex((x) => x.id === p.id) === i);
  const sameBoard = products.every((p) => p.category_id === products[0]?.category_id);
  const rows = products.length ? await compareProducts(products) : [];
  const idsNow = products.map((p) => p.id);

  return (
    <article className="compare-page">
      <h1 style={{ fontSize: 20, margin: "4px 0 12px" }}>⚖ 제품 비교</h1>
      {products.length === 0 ? (
        <div className="empty">
          <p>비교할 제품을 고르세요. 보드의 &ldquo;제품 목록&rdquo;이나 제품 페이지에서 시작할 수 있어요.</p>
        </div>
      ) : (
        <>
          {!sameBoard && <p className="notice">서로 다른 보드의 제품입니다. 같은 이름의 항목이라도 기준이 다를 수 있어요.</p>}
          <div className="table-scroll" role="region" aria-label="제품 비교 표" tabIndex={0}>
            <table className="data-table compare-table">
              <thead>
                <tr>
                  <th scope="col">항목</th>
                  {products.map((p) => (
                    <th scope="col" key={p.id}>
                      <Link href={`/p/${p.id}`}>
                        <span className="product-brand">{p.brand}</span> {p.name}
                      </Link>
                      <div className="hint">
                        글 {p.post_count}개 ·{" "}
                        <Link href={`/compare?ids=${idsNow.filter((x) => x !== p.id).join(",")}`} aria-label={`${p.brand} ${p.name} 비교에서 빼기`}>
                          빼기
                        </Link>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={products.length + 1} className="hint">
                      아직 수치를 적은 글이 없습니다.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.key}>
                      <th scope="row">
                        {r.attribute}
                        {r.basis && <div className="hint">{r.basis}</div>}
                      </th>
                      {r.cells.map((c, i) => (
                        <td key={products[i]!.id} className="num">
                          {!c ? (
                            <span className="hint">-</span>
                          ) : (
                            <>
                              {cell(c.label, r.unit) && (
                                <div>
                                  {cell(c.label, r.unit)} <span className="hint">표시</span>
                                  {c.renewed && <span className="badge-renewed" title="라벨이 바뀐 뒤 글의 값입니다 (제품 페이지에서 변경 내역 보기)">🔄 리뉴얼 후</span>}
                                </div>
                              )}
                              {cell(c.measured, r.unit) && <div>{cell(c.measured, r.unit)} <span className="hint">실측</span></div>}
                            </>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="hint">
            값은 각 제품 글들의 중앙값입니다. 단위가 다르면(mg·µg·g 등) 맞춰서 보여주고, 기준(1정·1일 섭취량 등)이 다른 값은 다른 줄에 둡니다.
          </p>
        </>
      )}
      {products.length > 0 && products.length < MAX_COMPARE && (
        <div className="compare-add">
          <CompareAdd ids={idsNow} category={products[0]!.category.slug} />
        </div>
      )}
    </article>
  );
}
