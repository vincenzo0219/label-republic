import Link from "next/link";
import { boardGuide } from "@/lib/onboarding";
import type { BoardNeeds } from "@/lib/repo/onboarding";

/**
 * 글이 적은 방의 안내 (Sprint 32): 이 방에 쓰기 좋은 글(누르면 글쓰기 틀로),
 * 제보가 더 필요한 리뉴얼 후보·글이 하나뿐인 제품 (같은 제품 라벨을 올리면 교차 확인).
 */
export function BoardGuide({ slug, name, needs }: { slug: string; name: string; needs: BoardNeeds }) {
  const guide = boardGuide(slug);
  const write = (qs: Record<string, string>) => `/write?${new URLSearchParams({ category: slug, ...qs })}`;
  return (
    <section className="board-guide" aria-labelledby="board-guide-h">
      {/* 방 설명이 바로 위에 있으므로 설명을 되풀이하지 않고 예시만 (론칭 2주차) */}
      <h2 id="board-guide-h" className="sr-only">{name} 글쓰기 예시</h2>
      <nav className="chips guide-chips" aria-label={`${name} 글쓰기 예시`}>
        <span className="hint">✍️ 이렇게 시작해 보세요</span>
        {guide.templates.map((t) => (
          <Link key={t.key} className="chip chip-sm" href={write({ template: t.key })} title={t.hint}>
            {t.label}
          </Link>
        ))}
      </nav>
      {needs.pending.length > 0 && (
        <>
          <h3>🔍 확인이 필요한 제품</h3>
          <p className="hint" style={{ marginTop: 0 }}>라벨이 바뀐 것 같지만 제보가 더 필요해요. 가지고 있다면 라벨 사진을 올려 주세요.</p>
          <ul className="guide-needs">
            {needs.pending.map((r) => (
              <li key={r.id}>
                <Link href={write({ product: r.product.id })}>
                  {r.product.brand} {r.product.name}
                </Link>
                <span className="hint">
                  {" "}
                  · {r.attribute} 새 값 제보 {r.new_authors}명
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {needs.lonely.length > 0 && (
        <>
          <h3>🧾 글이 하나뿐인 제품</h3>
          <p className="hint" style={{ marginTop: 0 }}>같은 제품의 라벨을 한 번 더 올리면 값이 교차 확인돼요.</p>
          <ul className="guide-needs">
            {needs.lonely.map((p) => (
              <li key={p.id}>
                <Link href={`/p/${p.id}`}>
                  {p.brand} {p.name}
                </Link>
                <span className="hint"> · </span>
                <Link href={write({ product: p.id })} className="hint">
                  이 제품 글쓰기
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
