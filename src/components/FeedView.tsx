import Link from "next/link";
import { listCategories } from "@/lib/repo/categories";
import { listPosts } from "@/lib/repo/posts";
import type { Category, PostType } from "@/lib/types";
import type { SortKey } from "@/lib/validation";
import { latestDigest } from "@/lib/repo/report";
import { CategoryTabs } from "./CategoryTabs";
import { InterestToggle } from "./InterestToggle";
import { Pagination } from "./Pagination";
import { PostCard } from "./PostCard";
import { SortBar } from "./SortBar";

const TYPE_FILTERS: { value?: PostType; label: string }[] = [
  { label: "전체" },
  { value: "info", label: "📋 정보" },
  { value: "chat", label: "💬 잡담" },
  { value: "meetup", label: "📅 정모" },
];

/** 홈 피드 / 카테고리 피드 공용 서버 컴포넌트 */
export async function FeedView({
  category,
  sort,
  page,
  type,
  sourced = false,
}: {
  category?: Category;
  sort: SortKey;
  page: number;
  type?: PostType;
  /** 출처가 달린 글만 */
  sourced?: boolean;
}) {
  const [categories, feed, digest] = await Promise.all([
    listCategories(),
    listPosts({ categoryId: category?.id, sort, page, type, sourced }),
    category ? latestDigest(category.id) : Promise.resolve(null),
  ]);
  const basePath = category ? `/c/${encodeURIComponent(category.slug)}` : "/";
  const typeParam: Record<string, string> = { ...(type ? { type } : {}), ...(sourced ? { sourced: "1" } : {}) };
  const params: Record<string, string> = { ...typeParam, ...(sort === "trust" ? {} : { sort }) };
  const href = (t: PostType | undefined, src: boolean) => {
    const qs = new URLSearchParams({ ...(t ? { type: t } : {}), ...(src ? { sourced: "1" } : {}), ...(sort === "trust" ? {} : { sort }) }).toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const typeHref = (t?: PostType) => href(t, sourced);
  return (
    <>
      <h1 className="sr-only">{category ? `${category.name} 보드` : "라벨공화국 — 방장 없는 성분·취미 팩트체크 커뮤니티"}</h1>
      <CategoryTabs categories={categories} active={category?.slug} />
      {category && (
        <div className="board-head">
          <p className="hint" style={{ margin: 0 }}>
            {category.description}
            {category.auto_promoted_at && " · 커뮤니티 투표로 개설된 보드"}
          </p>
          <div className="board-actions">
            <Link className="btn btn-sm" href={`${basePath}/products`}>
              🏷 제품별
            </Link>
            <Link className="btn btn-sm" href={`${basePath}/facts`}>
              🧪 성분별
            </Link>
            <InterestToggle slug={category.slug} name={category.name} />
          </div>
        </div>
      )}
      {digest && (
        <details className="digest-inline">
          <summary>🗞 이번 주 요약 · {digest.headline}</summary>
          <ol className="summary-lines">
            {digest.lines.map((l, i) => (
              <li key={i} data-n={i + 1}>
                {digest.post_ids[i] ? <Link href={`/posts/${digest.post_ids[i]}`}>{l}</Link> : l}
              </li>
            ))}
          </ol>
        </details>
      )}
      <nav className="type-filter" aria-label="글 유형">
        {TYPE_FILTERS.map((f) => (
          <Link key={f.label} href={typeHref(f.value)} aria-current={type === f.value ? "true" : undefined} rel="nofollow">
            {f.label}
          </Link>
        ))}
        <Link className="filter-toggle" href={href(type, !sourced)} aria-current={sourced ? "true" : undefined} rel="nofollow">
          📚 출처 있는 글만
        </Link>
      </nav>
      <SortBar basePath={basePath} params={typeParam} sort={sort} total={feed.total} />
      {feed.items.length === 0 ? (
        <div className="empty">
          <p>
            {type === "meetup" ? "아직 제안된 정모가 없습니다." : type === "chat" ? "아직 잡담이 없습니다." : "아직 글이 없습니다. 첫 번째 팩트를 남겨주세요."}
          </p>
        </div>
      ) : (
        feed.items.map((post) => <PostCard key={post.id} post={post} showCategory={!category} />)
      )}
      <Pagination basePath={basePath} params={params} page={feed.page} pageSize={feed.pageSize} total={feed.total} />
    </>
  );
}
