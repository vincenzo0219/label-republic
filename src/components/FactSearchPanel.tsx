import Link from "next/link";
import { parseFactQuery } from "@/lib/fact-query";
import { attrKey, FACT_KIND_LABEL, formatValue } from "@/lib/products";
import { boardsWithAttribute, listBoardAttributes, searchFacts } from "@/lib/repo/facts";

type Cat = { id: number; slug: string; name: string };

/**
 * 검색 결과 위 "성분 조건" 패널.
 *  - "마그네슘 200mg 이상"처럼 수치 조건이 있으면 보드마다 조건에 맞는 제품 상위 5개
 *  - "마그네슘"처럼 항목 이름만 있으면 그 항목의 순위 페이지 링크
 */
export async function FactSearchPanel({ q, categories }: { q: string; categories: Cat[] }) {
  const parsed = parseFactQuery(q);
  if (!parsed) {
    const key = attrKey(q);
    if (!key) return null;
    // 항목 키가 있는 보드만 (대부분의 검색어는 여기서 끝난다 — 캐시된 조회 한 번)
    const has = await boardsWithAttribute(key);
    if (!has.size) return null;
    const links = (
      await Promise.all(
        categories.filter((c) => has.has(c.id)).map(async (c) => {
          const exact = (await listBoardAttributes(c.id)).find((a) => a.attr_key === key);
          return exact ? [{ c, a: exact }] : [];
        }),
      )
    ).flat();
    if (!links.length) return null;
    return (
      <nav className="fact-links" aria-label="성분 순위">
        {links.map(({ c, a }) => (
          <Link key={c.slug} className="chip chip-sm" href={`/c/${encodeURIComponent(c.slug)}/facts?attr=${encodeURIComponent(a.attr_key)}`}>
            🧪 {a.attribute} 순위 · {c.name} ({a.products})
          </Link>
        ))}
      </nav>
    );
  }

  const boards = await searchFacts(categories, parsed);
  if (!boards.length) return null;
  const qs = (slug: string, attr: string, basis: string) => {
    const p = new URLSearchParams({ attr, basis });
    if (parsed.min !== undefined) p.set("min", String(Number(parsed.min.toPrecision(6))));
    if (parsed.max !== undefined) p.set("max", String(Number(parsed.max.toPrecision(6))));
    if (parsed.unit) p.set("unit", parsed.unit);
    if (parsed.max !== undefined && parsed.min === undefined) p.set("order", "asc");
    return `/c/${encodeURIComponent(slug)}/facts?${p}`;
  };
  return (
    <section className="fact-panel" aria-labelledby="fact-panel-h">
      <h2 id="fact-panel-h">🧪 성분 조건: {parsed.label}</h2>
      {boards.map(({ category, result }) => (
        <div key={category.slug} className="fact-panel-board">
          <p className="hint">
            {category.name} · {result.attribute} · {result.basis ? `${result.basis} 기준` : "기준 없음"} · {FACT_KIND_LABEL[result.kind]}
          </p>
          {result.unit_mismatch ? (
            <p className="hint">{parsed.unit} 단위로는 이 보드의 {result.attribute} 수치와 비교할 수 없어요.</p>
          ) : result.items.length === 0 ? (
            <p className="hint">조건에 맞는 제품이 없어요 (이 항목이 있는 제품 {result.total}개).</p>
          ) : (
            <ol className="fact-panel-list">
              {result.items.map((r) => (
                <li key={r.id}>
                  <Link href={`/p/${r.id}`}>
                    {r.brand} {r.name}
                  </Link>{" "}
                  <b>
                    {formatValue(r.value)} {result.unit}
                  </b>
                  <span className="hint"> · 글 {r.posts}</span>
                </li>
              ))}
            </ol>
          )}
          <Link className="btn btn-sm" href={qs(category.slug, result.attr_key, result.basis_key)}>
            전체 순위·조건 바꾸기 →
          </Link>
        </div>
      ))}
    </section>
  );
}
