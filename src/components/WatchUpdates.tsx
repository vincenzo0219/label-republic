import Link from "next/link";
import { formatValue } from "@/lib/products";
import type { PostUpdate, ProductUpdate } from "@/lib/repo/watch";

function Count({ n, label, strong }: { n: number; label: string; strong?: boolean }) {
  if (!n) return null;
  return <span className={strong ? "watch-count is-strong" : "watch-count"}>{label} {n}</span>;
}

/** 📬 내 리포트: 관심 제품의 새 소식 (새 소식 있는 제품이 위) */
export function WatchedProducts({ items, onRemove }: { items: ProductUpdate[]; onRemove: (id: string) => void }) {
  const news = (p: ProductUpdate) => p.new_posts + p.newly_supported + (p.renewals?.length ?? 0);
  const sorted = [...items].sort((a, b) => news(b) - news(a));
  return (
    <section aria-labelledby="watch-products-h">
      <h2 id="watch-products-h" className="section-title">🏷 관심 제품</h2>
      <ul className="watch-list">
        {sorted.map((p) => {
          const id = p.merged_into ?? p.id;
          const quiet = news(p) === 0;
          return (
            <li key={p.id} className={quiet ? "is-quiet" : undefined}>
              <div className="watch-row">
                <Link href={`/p/${id}`} className="watch-title">
                  {p.brand} {p.name}
                </Link>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => onRemove(p.id)} aria-label={`${p.brand} ${p.name} 관심 제품 해제`}>
                  해제
                </button>
              </div>
              <div className="watch-counts">
                {quiet ? <span className="hint">새 소식 없음</span> : null}
                <Count n={p.new_posts} label="새 글" />
                <Count n={p.newly_supported} label="🛠 동의된 정정 제안" strong />
              </div>
              {(p.renewals?.length ?? 0) > 0 && (
                <ul className="watch-renewals">
                  {p.renewals.map((r, i) => (
                    <li key={i}>
                      🔄 <b>라벨 변경</b>: {r.attribute}
                      {r.basis ? ` (${r.basis})` : ""} {formatValue(r.from)} → <b>{formatValue(r.to)} {r.unit}</b>
                    </li>
                  ))}
                </ul>
              )}
              {p.posts.length > 0 && (
                <ul className="watch-previews">
                  {p.posts.map((x) => (
                    <li key={x.id}>
                      <Link href={`/posts/${x.id}`}>{x.title}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** 📬 내 리포트: 지켜보는 글(내가 쓴 글·참여한 글 포함)의 새 소식 */
export function WatchedPosts({ items, onRemove }: { items: PostUpdate[]; onRemove: (id: string) => void }) {
  const total = (u: PostUpdate) => u.new_comments + u.new_corrections + u.newly_supported + u.applied + (u.edited ? 1 : 0);
  const sorted = [...items].sort((a, b) => total(b) - total(a));
  const quietCount = sorted.filter((u) => !total(u) && !u.is_blinded).length;
  const active = sorted.filter((u) => total(u) || u.is_blinded);
  return (
    <section aria-labelledby="watch-posts-h">
      <h2 id="watch-posts-h" className="section-title">🔔 지켜보는 글</h2>
      {active.length === 0 && <p className="hint">지켜보는 글 {items.length}개에 새 소식이 없어요.</p>}
      {active.length > 0 && (
        <ul className="watch-list">
          {active.map((u) => (
            <li key={u.id}>
              <div className="watch-row">
                <Link href={`/posts/${u.id}${u.new_corrections || u.newly_supported || u.applied ? "#corrections" : ""}`} className="watch-title">
                  {u.title}
                </Link>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => onRemove(u.id)} aria-label={`${u.title} 소식 받기 해제`}>
                  해제
                </button>
              </div>
              <div className="watch-counts">
                {u.is_blinded && <span className="watch-count">🚫 블라인드됨</span>}
                <Count n={u.new_comments} label="💬 새 댓글" />
                <Count n={u.new_corrections} label="🛠 새 정정 제안" strong />
                <Count n={u.newly_supported} label="✔ 동의된 정정 제안" strong />
                <Count n={u.applied} label="✅ 반영된 정정" />
                {u.edited && <span className="watch-count">✏ 수정됨</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {quietCount > 0 && active.length > 0 && <p className="hint">새 소식 없는 글 {quietCount}개</p>}
    </section>
  );
}
