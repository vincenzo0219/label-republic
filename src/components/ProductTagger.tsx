"use client";

import { useState } from "react";
import { FACT_KIND_LABEL, MAX_FACTS_PER_POST, MAX_PRODUCTS_PER_POST, normalizeUnit, productKey, productNameProblem, validUnit, type FactKind } from "@/lib/products";
import { ProductSearchBox } from "./ProductSearchBox";

export type ProductDraft = { key: string; id?: string; brand: string; name: string };
export type FactDraft = {
  key: string;
  product: string;
  attribute: string;
  value: string;
  unit: string;
  basis: string;
  kind: FactKind;
  /** 근거 사진 (첨부 사진 id) */
  image?: string;
  /** 라벨 읽기로 채운 수치 (서버가 읽은 결과와 비교해 그대로인지/고쳤는지 기록) */
  fromLabel?: boolean;
  /** 읽었을 때의 값 (factSnapshot) — 지금 값과 다르면 "읽은 뒤 고침"으로 보여준다. null 은 이미 고친 수치 */
  read?: string | null;
};

/** 항목·값·단위·기준 (고쳤는지 비교용) */
export const factSnapshot = (f: Pick<FactDraft, "attribute" | "value" | "unit" | "basis">) =>
  [f.attribute.trim(), f.value.replace(/,/g, "").trim(), normalizeUnit(f.unit), f.basis.trim()].join("|");

/** 수치 옆 "근거 사진" 선택지 — 올리기가 끝난 첨부 사진 */
export type EvidencePhoto = { id: string; label: string };

let seq = 0;
const nextKey = (p: string) => `${p}${++seq}`;
export const newProductDraft = (p: { id?: string; brand: string; name: string }): ProductDraft => ({ key: nextKey("p"), ...p });
export const newFactDraft = (product: string, f: Partial<Omit<FactDraft, "key" | "product">> = {}): FactDraft => ({
  key: nextKey("f"),
  product,
  attribute: f.attribute ?? "",
  value: f.value ?? "",
  unit: f.unit ?? "",
  basis: f.basis ?? "",
  kind: f.kind ?? "label",
  ...(f.image ? { image: f.image } : {}),
  ...(f.fromLabel ? { fromLabel: true } : {}),
  ...(f.read !== undefined ? { read: f.read } : {}),
});

const COMMON_UNITS = ["mg", "µg", "g", "IU", "%", "kcal", "ml", "mm", "Hz", "dB", "Ω", "mAh"];

function parseValue(v: string): number | null {
  const t = v.replace(/,/g, "").trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n < 1e12 ? n : null;
}

/** 입력 중 검사 — 서버도 같은 규칙으로 다시 검사한다 */
export function factProblem(f: FactDraft): string | null {
  if (!f.attribute.trim()) return "항목 이름을 입력해주세요.";
  if (parseValue(f.value) === null) return "값은 0 이상의 숫자로 입력해주세요 (예: 350, 12.5).";
  const unit = normalizeUnit(f.unit);
  if (!unit || !validUnit(unit)) return "단위를 입력해주세요 (예: mg, µg, IU, g, %).";
  return null;
}

/** 서버로 보낼 형태로 (photoIds 를 주면 그 안의 사진만 근거로 보낸다 — 지운 사진을 가리키지 않게) */
export function toRefs(products: ProductDraft[], facts: FactDraft[], photoIds?: string[]) {
  return {
    products: products.map((p) => (p.id ? { id: p.id } : { brand: p.brand.trim(), name: p.name.trim() })),
    facts: facts
      .filter((f) => f.attribute.trim() || f.value.trim())
      .map((f) => ({
        product: products.findIndex((p) => p.key === f.product),
        attribute: f.attribute.trim(),
        value: parseValue(f.value) ?? -1,
        unit: normalizeUnit(f.unit),
        basis: f.basis.trim(),
        kind: f.kind,
        ...(f.image && (!photoIds || photoIds.includes(f.image)) ? { image: f.image, ...(f.fromLabel ? { fromLabel: true } : {}) } : {}),
      })),
  };
}

/**
 * 제품 태그 + 성분·스펙 수치 입력.
 * 이미 있는 제품은 자동완성으로 고르고, 없으면 브랜드·제품명으로 새로 만든다 (표기가 조금 달라도 같은 제품으로 합쳐진다).
 */
export function ProductTagger({
  category,
  products,
  facts,
  photos = [],
  onChange,
}: {
  category: string;
  products: ProductDraft[];
  facts: FactDraft[];
  photos?: EvidencePhoto[];
  onChange: (products: ProductDraft[], facts: FactDraft[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [brand, setBrand] = useState("");
  const [name, setName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const room = MAX_PRODUCTS_PER_POST - products.length;
  const label = (p: ProductDraft) => `${p.brand} ${p.name}`;

  const addProduct = (p: ProductDraft) => {
    const dupe = products.some((x) => (p.id ? x.id === p.id : !x.id && productKey(x.brand, x.name) === productKey(p.brand, p.name)));
    if (dupe) return;
    onChange([...products, p], facts);
  };
  const removeProduct = (key: string) =>
    onChange(
      products.filter((p) => p.key !== key),
      facts.filter((f) => f.product !== key),
    );
  const updateFact = (key: string, patch: Partial<FactDraft>) => onChange(products, facts.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  const submitNew = () => {
    const problem = productNameProblem(brand, name);
    if (problem) {
      setAddError(problem);
      return;
    }
    addProduct(newProductDraft({ brand: brand.trim(), name: name.trim() }));
    setBrand("");
    setName("");
    setAdding(false);
    setAddError(null);
  };

  const attributes = [...new Set(facts.map((f) => f.attribute.trim()).filter(Boolean))];

  return (
    <div className="product-tagger">
      {products.length > 0 && (
        <ul className="product-chips" aria-label="태그한 제품">
          {products.map((p) => (
            <li key={p.key} className="product-chip is-editing">
              <span>
                🏷 {label(p)}
                {!p.id && <span className="hint"> (새 제품)</span>}
              </span>
              <button type="button" className="chip-remove" onClick={() => removeProduct(p.key)} aria-label={`${label(p)} 태그 삭제`}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {room > 0 &&
        (category ? (
          <div className="product-add">
            <ProductSearchBox
              category={category}
              label="태그할 제품 검색"
              exclude={products.flatMap((p) => (p.id ? [p.id] : []))}
              onPick={(p) => addProduct(newProductDraft({ id: p.id, brand: p.brand, name: p.name }))}
            />
            {!adding ? (
              <button type="button" className="btn btn-sm" onClick={() => setAdding(true)}>
                ＋ 새 제품
              </button>
            ) : (
              <div className="product-new">
                <input className="input input-sm" aria-label="새 제품 브랜드" placeholder="브랜드 (예: 나우푸드)" maxLength={60} value={brand} onChange={(e) => setBrand(e.target.value)} />
                <input
                  className="input input-sm"
                  aria-label="새 제품 이름"
                  placeholder="제품명 (예: 마그네슘 비스글리시네이트 200mg)"
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitNew();
                    }
                  }}
                />
                <div className="source-actions">
                  <button type="button" className="btn btn-sm" onClick={submitNew}>
                    추가
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => (setAdding(false), setAddError(null))}>
                    취소
                  </button>
                </div>
                {addError && (
                  <span className="error" role="alert">
                    {addError}
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <span className="hint">카테고리를 먼저 선택하면 제품을 태그할 수 있어요.</span>
        ))}

      {products.length > 0 && (
        <div className="fact-editor">
          {facts.length > 0 && (
            <ol className="fact-rows">
              {facts.map((f, i) => {
                const problem = f.attribute || f.value || f.unit ? factProblem(f) : null;
                return (
                  <li key={f.key}>
                    {products.length > 1 && (
                      <select className="select input-sm" aria-label={`${i + 1}번째 수치의 제품`} value={f.product} onChange={(e) => updateFact(f.key, { product: e.target.value })}>
                        {products.map((p) => (
                          <option key={p.key} value={p.key}>
                            {label(p)}
                          </option>
                        ))}
                      </select>
                    )}
                    <div className="fact-inputs">
                      <input className="input input-sm" list="lr-fact-attrs" aria-label={`${i + 1}번째 수치 항목`} placeholder="항목 (예: 마그네슘)" maxLength={40} value={f.attribute}
                        onChange={(e) => updateFact(f.key, { attribute: e.target.value })} />
                      <input className="input input-sm fact-value" inputMode="decimal" aria-label={`${i + 1}번째 수치 값`} placeholder="값" maxLength={20} value={f.value}
                        aria-invalid={problem?.startsWith("값") ? true : undefined}
                        onChange={(e) => updateFact(f.key, { value: e.target.value })} />
                      <input className="input input-sm fact-unit" list="lr-fact-units" aria-label={`${i + 1}번째 수치 단위`} placeholder="단위" maxLength={12} value={f.unit}
                        onChange={(e) => updateFact(f.key, { unit: e.target.value })} />
                      <input className="input input-sm" aria-label={`${i + 1}번째 수치 기준`} placeholder="기준 (예: 1정, 100g)" maxLength={30} value={f.basis}
                        onChange={(e) => updateFact(f.key, { basis: e.target.value })} />
                    </div>
                    {(photos.length > 0 || f.fromLabel) && (
                      <div className="fact-evidence">
                        {photos.length > 0 && (
                          <select
                            className="select input-sm"
                            aria-label={`${i + 1}번째 수치의 근거 사진`}
                            value={f.image && photos.some((ph) => ph.id === f.image) ? f.image : ""}
                            onChange={(e) => updateFact(f.key, { image: e.target.value || undefined })}
                          >
                            <option value="">근거 사진 없음</option>
                            {photos.map((ph) => (
                              <option key={ph.id} value={ph.id}>
                                📷 {ph.label}
                              </option>
                            ))}
                          </select>
                        )}
                        {f.fromLabel && f.image && photos.some((ph) => ph.id === f.image) && (
                          <span className="badge badge-ai">{f.read === factSnapshot(f) ? "🔍 라벨에서 읽은 그대로" : "✏️ 읽은 뒤 고침"}</span>
                        )}
                      </div>
                    )}
                    <div className="source-row-meta">
                      <div className="chips" role="radiogroup" aria-label={`${i + 1}번째 수치 구분`}>
                        {(Object.keys(FACT_KIND_LABEL) as FactKind[]).map((k) => (
                          <button type="button" key={k} className="chip chip-sm" role="radio" aria-checked={f.kind === k} onClick={() => updateFact(f.key, { kind: k })}>
                            {FACT_KIND_LABEL[k]}
                          </button>
                        ))}
                      </div>
                      {problem && (
                        <span className="error" role="alert">
                          {problem}
                        </span>
                      )}
                      <button type="button" className="btn btn-sm btn-danger" aria-label={`${i + 1}번째 수치 삭제`} onClick={() => onChange(products, facts.filter((x) => x.key !== f.key))}>
                        삭제
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <datalist id="lr-fact-units">
            {COMMON_UNITS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
          <datalist id="lr-fact-attrs">
            {attributes.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
          {facts.length < MAX_FACTS_PER_POST && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                const last = facts.at(-1);
                onChange(products, [...facts, newFactDraft(last?.product ?? products[0]!.key, { kind: last?.kind, basis: last?.basis })]);
              }}
            >
              🧪 수치 추가 ({facts.length}/{MAX_FACTS_PER_POST})
            </button>
          )}
          <span className="hint">
            라벨·스펙에 적힌 값은 <b>표시값</b>, 직접 재거나 성적서로 확인한 값은 <b>실측값</b>으로 적어주세요. 제품 페이지에서 여러 글의 값을 모아 비교합니다.
          </span>
        </div>
      )}
    </div>
  );
}
