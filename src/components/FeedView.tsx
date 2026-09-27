import Link from "next/link";
import { listCategories } from "@/lib/repo/categories";
import { listPosts } from "@/lib/repo/posts";
import type { Category, PostType } from "@/lib/types";
import type { SortKey } from "@/lib/validation";
import { CategoryTabs } from "./CategoryTabs";
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
export async function FeedView({ category, sort, page, type }: { category?: Category; sort: SortKey; page: number; type?: PostType }) {
  const [categories, feed] = await Promise.all([listCategories(), listPosts({ categoryId: category?.id, sort, page, type })]);
  const basePath = category ? `/c/${encodeURIComponent(category.slug)}` : "/";
  const typeParam: Record<string, string> = type ? { type } : {};
  const params: Record<string, string> = { ...typeParam, ...(sort === "trust" ? {} : { sort }) };
  const typeHref = (t?: PostType) => {
    const qs = new URLSearchParams({ ...(t ? { type: t } : {}), ...(sort === "trust" ? {} : { sort }) }).toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  return (
    <>
      <CategoryTabs categories={categories} active={category?.slug} />
      {category && (
        <p className="hint" style={{ margin: "0 0 8px" }}>
          {category.description}
          {category.auto_promoted_at && " · 커뮤니티 투표로 개설된 보드"}
        </p>
      )}
      <nav className="type-filter" aria-label="글 유형">
        {TYPE_FILTERS.map((f) => (
          <Link key={f.label} href={typeHref(f.value)} aria-current={type === f.value ? "true" : undefined} rel="nofollow">
            {f.label}
          </Link>
        ))}
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
