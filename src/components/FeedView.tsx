import { listCategories } from "@/lib/repo/categories";
import { listPosts } from "@/lib/repo/posts";
import type { Category } from "@/lib/types";
import type { SortKey } from "@/lib/validation";
import { CategoryTabs } from "./CategoryTabs";
import { Pagination } from "./Pagination";
import { PostCard } from "./PostCard";
import { SortBar } from "./SortBar";

/** 홈 피드 / 카테고리 피드 공용 서버 컴포넌트 */
export async function FeedView({ category, sort, page }: { category?: Category; sort: SortKey; page: number }) {
  const [categories, feed] = await Promise.all([listCategories(), listPosts({ categoryId: category?.id, sort, page })]);
  const basePath = category ? `/c/${encodeURIComponent(category.slug)}` : "/";
  const params: Record<string, string> = sort === "trust" ? {} : { sort };
  return (
    <>
      <CategoryTabs categories={categories} active={category?.slug} />
      {category && (
        <p className="hint" style={{ margin: "0 0 8px" }}>
          {category.description}
          {category.auto_promoted_at && " · 커뮤니티 투표로 개설된 보드"}
        </p>
      )}
      <SortBar basePath={basePath} params={{}} sort={sort} total={feed.total} />
      {feed.items.length === 0 ? (
        <div className="empty">
          <p>아직 글이 없습니다. 첫 번째 팩트를 남겨주세요.</p>
        </div>
      ) : (
        feed.items.map((post) => <PostCard key={post.id} post={post} showCategory={!category} />)
      )}
      <Pagination basePath={basePath} params={params} page={feed.page} pageSize={feed.pageSize} total={feed.total} />
    </>
  );
}
