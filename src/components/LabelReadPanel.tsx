"use client";

import { useState } from "react";
import { formatValue, MAX_FACTS_PER_POST, MAX_PRODUCTS_PER_POST, productKey, productNameProblem } from "@/lib/products";
import { formatLabelDate, parseLabelDate } from "@/lib/label-dates";
import { dateSnapshot, factSnapshot, newFactDraft, newProductDraft, type FactDraft, type ProductDraft } from "./ProductTagger";

export type LabelRead = {
  readable: boolean;
  reason: string;
  products: { brand: string; name: string }[];
  facts: { product: number; attribute: string; value: number; unit: string; basis: string }[];
  notes: string;
  model: string;
  /** Sprint 26 — 없거나 빈 문자열이면 날짜를 못 읽음 */
  made_on?: string;
  expires_on?: string;
};

type ProductChoice = { use: boolean; target: string; brand: string; name: string };

/** 읽은 제품을 이미 태그한 제품에 맞출지(같은 이름이거나, 한 개씩뿐이면 그것) */
function initialChoices(read: LabelRead, tagged: ProductDraft[]): ProductChoice[] {
  return read.products.map((p) => {
    const same = tagged.find((t) => productKey(t.brand, t.name) === productKey(p.brand, p.name));
    const only = read.products.length === 1 && tagged.length === 1 ? tagged[0] : undefined;
    return { use: true, target: (same ?? only)?.key ?? "new", brand: p.brand, name: p.name };
  });
}

/**
 * 라벨 읽기 결과 확인 — 넣을 제품·수치를 고르고, 새 제품은 이름을 고친 뒤 글쓰기 칸에 넣는다.
 * 넣은 뒤에도 수치 칸에서 얼마든지 고칠 수 있고, 고친 수치는 "읽은 뒤 고침"으로 기록된다.
 */
export function LabelReadPanel({
  read,
  imageId,
  photoLabel,
  products,
  facts,
  onApply,
  onClose,
}: {
  read: LabelRead;
  imageId: string;
  photoLabel: string;
  products: ProductDraft[];
  facts: FactDraft[];
  onApply: (products: ProductDraft[], facts: FactDraft[], message: string) => void;
  onClose: () => void;
}) {
  const [choices, setChoices] = useState(() => initialChoices(read, products));
  const [pickedFacts, setPickedFacts] = useState(() => read.facts.map(() => true));
  const hasDates = !!(read.made_on || read.expires_on);
  const [useDates, setUseDates] = useState(hasDates);
  // 날짜를 넣을 제품: 읽은 제품 첫째(순서 번호 "r0") 또는 이미 태그한 제품(key). 사진에 제품이 없으면(병 바닥) 태그한 첫 제품
  const [dateTarget, setDateTarget] = useState(() => (read.products.length ? "r0" : (products[0]?.key ?? "")));
  const [error, setError] = useState<string | null>(null);

  if (!read.readable) {
    return (
      <div className="label-read" role="region" aria-label="라벨 읽기 결과">
        <p>
          <b>{photoLabel}</b>에서 수치를 읽지 못했어요: {read.reason}
        </p>
        <p className="hint">성분표가 화면을 가득 채우게, 흔들리지 않게 다시 찍어 보거나 수치를 직접 입력해주세요.</p>
        <button type="button" className="btn btn-sm" onClick={onClose}>
          닫기
        </button>
      </div>
    );
  }

  const setChoice = (i: number, patch: Partial<ProductChoice>) => setChoices((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  function apply() {
    setError(null);
    let nextProducts = [...products];
    const keyOf: (string | undefined)[] = [];
    for (const [i, c] of choices.entries()) {
      if (!c.use) continue;
      if (c.target !== "new") {
        keyOf[i] = c.target;
        continue;
      }
      const problem = productNameProblem(c.brand, c.name);
      if (problem) {
        setError(`${i + 1}번째 제품: ${problem}`);
        return;
      }
      const same = nextProducts.find((t) => !t.id && productKey(t.brand, t.name) === productKey(c.brand, c.name));
      if (same) {
        keyOf[i] = same.key;
        continue;
      }
      if (nextProducts.length >= MAX_PRODUCTS_PER_POST) {
        setError(`제품은 글당 ${MAX_PRODUCTS_PER_POST}개까지 태그할 수 있어요. 이미 태그한 제품에 맞추거나 하나를 빼주세요.`);
        return;
      }
      const draft = newProductDraft({ brand: c.brand.trim(), name: c.name.trim() });
      nextProducts = [...nextProducts, draft];
      keyOf[i] = draft.key;
    }
    if (hasDates && useDates) {
      const key = dateTarget.startsWith("r") ? keyOf[Number(dateTarget.slice(1))] : dateTarget;
      if (!key) {
        setError("날짜를 넣을 제품을 골라주세요 (그 제품을 함께 넣거나 이미 태그한 제품 선택).");
        return;
      }
      const dates = { made: read.made_on ?? "", expires: read.expires_on ?? "" };
      nextProducts = nextProducts.map((p) => (p.key === key ? { ...p, ...dates, dateImage: imageId, dateFromLabel: true, dateRead: dateSnapshot(dates) } : p));
    }
    let nextFacts = [...facts];
    let added = 0;
    let skipped = 0;
    for (const [i, f] of read.facts.entries()) {
      if (!pickedFacts[i]) continue;
      const product = keyOf[f.product];
      if (!product) continue;
      // 같은 제품·항목·기준이 이미 있으면 덮어쓰지 않는다 (작성자가 적은 값을 지우지 않게)
      const exists = nextFacts.some((x) => x.product === product && x.attribute.trim() === f.attribute && x.basis.trim() === f.basis);
      if (exists || nextFacts.length >= MAX_FACTS_PER_POST) {
        skipped++;
        continue;
      }
      const fields = { attribute: f.attribute, value: String(f.value), unit: f.unit, basis: f.basis };
      nextFacts = [...nextFacts, newFactDraft(product, { ...fields, kind: "label", image: imageId, fromLabel: true, read: factSnapshot(fields) })];
      added++;
    }
    // 비어 있던 첫 수치 줄(수치 추가만 누르고 안 적은 줄)은 정리
    nextFacts = nextFacts.filter((x) => x.attribute.trim() || x.value.trim() || x.unit.trim());
    const dated = hasDates && useDates ? " 라벨 날짜도 넣었어요." : "";
    const message = `${added}개 수치를 넣었어요${skipped ? ` (이미 있거나 개수 제한으로 ${skipped}개는 뺐어요)` : ""}.${dated} 사진과 한 번 더 대조해 주세요.`;
    onApply(nextProducts, nextFacts, message);
  }

  const usedTargets = choices.filter((c) => c.use).length;
  const pickedCount = read.facts.filter((f, i) => pickedFacts[i] && choices[f.product]?.use).length;

  return (
    <div className="label-read" role="region" aria-label="라벨 읽기 결과">
      <p className="label-read-title">
        🔍 <b>{photoLabel}</b>에서 읽은 내용 — 사진과 대조한 뒤 넣어주세요
      </p>
      {read.notes && <p className="notice">⚠️ {read.notes}</p>}

      {choices.length > 0 && (
        <fieldset className="label-read-group">
          <legend>제품</legend>
          {choices.map((c, i) => (
            <div key={i} className="label-read-product">
              <label className="check">
                <input type="checkbox" checked={c.use} onChange={(e) => setChoice(i, { use: e.target.checked })} />
                <span>
                  {read.products[i]!.brand || "(브랜드 안 보임)"} {read.products[i]!.name}
                </span>
              </label>
              {c.use && (
                <>
                  <select className="select input-sm" aria-label={`${i + 1}번째 읽은 제품을 어디에`} value={c.target} onChange={(e) => setChoice(i, { target: e.target.value })}>
                    <option value="new">새 제품으로 태그</option>
                    {products.map((p) => (
                      <option key={p.key} value={p.key}>
                        태그한 제품: {p.brand} {p.name}
                      </option>
                    ))}
                  </select>
                  {c.target === "new" && (
                    <div className="product-new">
                      <input className="input input-sm" aria-label={`${i + 1}번째 읽은 제품 브랜드`} placeholder="브랜드" maxLength={60} value={c.brand}
                        onChange={(e) => setChoice(i, { brand: e.target.value })} />
                      <input className="input input-sm" aria-label={`${i + 1}번째 읽은 제품 이름`} placeholder="제품명" maxLength={120} value={c.name}
                        onChange={(e) => setChoice(i, { name: e.target.value })} />
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </fieldset>
      )}

      {read.facts.length > 0 && (
        <fieldset className="label-read-group">
          <legend>수치 ({pickedCount}/{read.facts.length})</legend>
          <ul className="label-read-facts">
            {read.facts.map((f, i) => {
              const off = !choices[f.product]?.use;
              return (
                <li key={i}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={pickedFacts[i] && !off}
                      disabled={off}
                      onChange={(e) => setPickedFacts((ps) => ps.map((p, j) => (j === i ? e.target.checked : p)))}
                    />
                    <span>
                      {f.attribute} <b>{formatValue(f.value)} {f.unit}</b>
                      {f.basis && <span className="hint"> / {f.basis}</span>}
                      {read.products.length > 1 && <span className="hint"> · {read.products[f.product]?.name}</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}

      {hasDates && (
        <fieldset className="label-read-group">
          <legend>라벨 날짜</legend>
          <label className="check">
            <input type="checkbox" checked={useDates} onChange={(e) => setUseDates(e.target.checked)} />
            <span>
              {read.made_on && <>제조일자 <b>{formatLabelDate(parseLabelDate(read.made_on)!)}</b></>}
              {read.made_on && read.expires_on && " · "}
              {read.expires_on && <>유통기한 <b>{formatLabelDate(parseLabelDate(read.expires_on)!)}</b></>}
            </span>
          </label>
          {useDates && (
            <select className="select input-sm" aria-label="라벨 날짜를 넣을 제품" value={dateTarget} onChange={(e) => setDateTarget(e.target.value)}>
              {read.products.map((p, i) => (
                <option key={`r${i}`} value={`r${i}`}>
                  읽은 제품: {p.brand} {p.name}
                </option>
              ))}
              {products.map((p) => (
                <option key={p.key} value={p.key}>
                  태그한 제품: {p.brand} {p.name}
                </option>
              ))}
            </select>
          )}
        </fieldset>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={apply} disabled={!usedTargets && !(hasDates && useDates)}>
          {pickedCount ? `선택한 수치 ${pickedCount}개 넣기` : hasDates && useDates ? "날짜 넣기" : "제품만 넣기"}
        </button>
        <button type="button" className="btn btn-sm" onClick={onClose}>
          닫기
        </button>
      </div>
      <p className="hint">AI가 사진을 읽은 결과라 틀릴 수 있어요. 넣은 수치는 이 사진이 근거로 표시되고, 고치면 &ldquo;읽은 뒤 고침&rdquo;으로 기록돼요.</p>
    </div>
  );
}
