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
      <h2 id="board-guide-h">✍️ {name}에 이런 글을 써 주세요</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        {guide.lead}
        {needs.infoPosts === 0 ? " 아직 정보 글이 없어요 — 첫 글이 이 방의 기준이 됩니다." : ` 지금 정보 글 ${needs.infoPosts}개.`}
      </p>
      <ul className="guide-templates">
        {guide.templates.map((t) => (
          <li key={t.key}>
            <Link href={write({ template: t.key })}>
              <b>{t.label}</b>
              <span className="hint">{t.hint}</span>
            </Link>
          </li>
        ))}
      </ul>
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
