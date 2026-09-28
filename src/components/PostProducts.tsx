import Link from "next/link";
import { imageUrl } from "@/lib/media-url";
import { FACT_KIND_LABEL, formatValue } from "@/lib/products";
import type { FactOrigin, PostFact, ProductTag } from "@/lib/types";

/** 수치 출처 (Sprint 20) — 라벨 사진을 AI 가 읽었는지, 그 뒤 작성자가 고쳤는지 */
const ORIGIN_LABEL: Record<FactOrigin, string | null> = {
  manual: null,
  ai: "AI 판독 · 작성자 확인",
  ai_edited: "AI 판독 후 작성자 수정",
};

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
export function PostFactsTable({ products, facts, photos = [] }: { products: ProductTag[]; facts: PostFact[]; photos?: { id: string }[] }) {
  if (!facts.length) return null;
  const photoNo = new Map(photos.map((ph, i) => [ph.id, i + 1]));
  const withPhoto = facts.filter((f) => f.image && photoNo.has(f.image)).length;
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
                        {f.image && photoNo.has(f.image) && (
                          <>
                            {" "}
                            <a className="fact-photo" href={imageUrl(f.image)} target="_blank" rel="noopener" aria-label={`${f.attribute} 근거: 사진 ${photoNo.get(f.image)} 원본 보기`}>
                              📷 사진 {photoNo.get(f.image)}
                            </a>
                            {ORIGIN_LABEL[f.origin] && <span className="hint fact-origin">{ORIGIN_LABEL[f.origin]}</span>}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ))}
      <p className="hint">
        표시값은 제품 라벨·스펙에 적힌 값, 실측값은 작성자가 직접 재거나 시험 성적서로 확인한 값입니다.
        {withPhoto > 0 && ` 📷 표시된 ${withPhoto}개는 근거 사진과 직접 대조해 볼 수 있어요. 사진과 다르면 정정 제안을 남겨주세요.`}
      </p>
    </section>
  );
}
