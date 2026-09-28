import Link from "next/link";
import { FACT_KIND_LABEL, formatValue } from "@/lib/products";
import type { PostFact, ProductTag } from "@/lib/types";

/** 글 머리의 제품 태그 — 누르면 제품 페이지 */
export function ProductChips({ products }: { products: ProductTag[] }) {
  if (!products.length) return null;
  return (
    <ul className="product-chips" aria-label="태그한 제품">
      {products.map((p) => (
        <li key={p.id}>
          <Link href={`/p/${p.id}`} className="product-chip">
            🏷 {p.brand} {p.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** 글에 적은 제품 수치 (제품별 표) */
export function PostFactsTable({ products, facts }: { products: ProductTag[]; facts: PostFact[] }) {
  if (!facts.length) return null;
  return (
    <section className="facts" aria-labelledby="facts-h">
      <h2 id="facts-h">🧪 제품 수치 {facts.length}</h2>
      {products
        .filter((p) => facts.some((f) => f.product_id === p.id))
        .map((p) => (
          <div key={p.id} className="table-scroll" role="region" aria-label={`${p.brand} ${p.name} 수치`} tabIndex={0}>
            <table className="data-table">
              <caption>
                <Link href={`/p/${p.id}`}>
                  {p.brand} {p.name}
                </Link>
              </caption>
              <thead>
                <tr>
                  <th scope="col">항목</th>
                  <th scope="col" className="num">값</th>
                  <th scope="col">기준</th>
                  <th scope="col">구분</th>
                </tr>
              </thead>
              <tbody>
                {facts
                  .filter((f) => f.product_id === p.id)
                  .map((f, i) => (
                    <tr key={i}>
                      <td>{f.attribute}</td>
                      <td className="num">
                        {formatValue(f.value)} {f.unit}
                      </td>
                      <td>{f.basis || "-"}</td>
                      <td>
                        <span className={`badge badge-fact-${f.kind}`}>{FACT_KIND_LABEL[f.kind]}</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ))}
      <p className="hint">표시값은 제품 라벨·스펙에 적힌 값, 실측값은 작성자가 직접 재거나 시험 성적서로 확인한 값입니다.</p>
    </section>
  );
}
