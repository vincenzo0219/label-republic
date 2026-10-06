import { Fragment } from "react";
import Link from "next/link";
import { listPosts } from "@/lib/repo/posts";
import { INGREDIENT_ROOMS, listCategories, quietRoomSlugs, roomTools } from "@/lib/repo/categories";
import type { Category, PostType } from "@/lib/types";
import type { SortKey } from "@/lib/validation";
import { latestDigest } from "@/lib/repo/report";
import { THIN_BOARD_POSTS } from "@/lib/onboarding";
import { boardNeeds } from "@/lib/repo/onboarding";
import { BoardGuide } from "./BoardGuide";
import { CategoryTabs } from "./CategoryTabs";
import { InterestToggle } from "./InterestToggle";
import { Pagination } from "./Pagination";
import { PostCard } from "./PostCard";
import { MarkSeen, NewDivider } from "./NewMarks";
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
  // 글이 적은 방의 첫 화면(필터 없음)에만 안내 (Sprint 32) — boardNeeds 는 글 수부터 세고 많으면 바로 끝낸다 (Sprint 33)
  const guideCandidate = category && page === 1 && !type && !sourced;
  const [categories, feed, digest, needs, tools, quiet] = await Promise.all([
    listCategories(),
    listPosts({ categoryId: category?.id, sort, page, type, sourced }),
    category ? latestDigest(category.id) : Promise.resolve(null),
    guideCandidate ? boardNeeds(category.id) : Promise.resolve(null),
    category ? roomTools(category.id) : Promise.resolve(null),
    quietRoomSlugs().catch(() => new Set<string>()),
  ]);
  const showGuide = category && needs && needs.infoPosts < THIN_BOARD_POSTS;
  const basePath = category ? `/c/${encodeURIComponent(category.slug)}` : "/";
  const typeParam: Record<string, string> = { ...(type ? { type } : {}), ...(sourced ? { sourced: "1" } : {}) };
  const params: Record<string, string> = { ...typeParam, ...(sort === "trust" ? {} : { sort }) };
  const href = (t: PostType | undefined, src: boolean) => {
    const qs = new URLSearchParams({ ...(t ? { type: t } : {}), ...(src ? { sourced: "1" } : {}), ...(sort === "trust" ? {} : { sort }) }).toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const typeHref = (t?: PostType) => href(t, sourced);
  const seenRoom = category?.slug ?? "all";
  return (
    <>
      <h1 className="sr-only">{category ? `${category.name} 방` : "노방장 — 방장 없는 덕후 커뮤니티"}</h1>
      <CategoryTabs categories={categories} active={category?.slug} quiet={[...quiet]} />
      {category && (
        <div className="board-head">
          <p className="hint" style={{ margin: 0 }}>
            {category.description}
            {category.auto_promoted_at && " · 커뮤니티 투표로 개설된 방"}
          </p>
          <div className="board-actions">
            {/* 데이터가 있을 때만 (Sprint 42) */}
            {tools?.products && (
              <Link className="btn btn-sm" href={`${basePath}/products`}>
                🏷 제품별
              </Link>
            )}
            {tools?.facts && (
              <Link className="btn btn-sm" href={`${basePath}/facts`}>
                {INGREDIENT_ROOMS.has(category.slug) ? "🧪 성분별" : "📏 스펙별"}
              </Link>
            )}
            {tools?.renewals && (
              <Link className="btn btn-sm" href={`${basePath}/renewals`}>
                🔄 라벨 변경
              </Link>
            )}
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
      {showGuide && <BoardGuide slug={category.slug} name={category.name} needs={needs} />}
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
            {type === "meetup"
              ? "아직 제안된 정모가 없습니다."
              : type === "chat"
                ? "아직 잡담이 없습니다. 가볍게 첫 인사를 남겨 보세요."
                : showGuide
                  ? "아직 글이 없습니다. 위의 예시로 첫 글을 시작해 보세요."
                  : category
                    ? "아직 글이 없습니다. 이 방의 첫 글을 남겨 주세요."
                    : "아직 글이 없어요. 첫 글을 남기거나, 이야기하고 싶은 주제의 방을 만들어 보세요."}
          </p>
          <div className="empty-actions">
            <Link className="btn btn-primary btn-sm" href={category ? `/write?category=${encodeURIComponent(category.slug)}` : "/write"}>
              ✍️ 글쓰기
            </Link>
            {!category && (
              <Link className="btn btn-sm" href="/boards">
                🏠 방 만들기
              </Link>
            )}
          </div>
        </div>
      ) : (
        feed.items.map((post, i) => {
          const prev = feed.items[i - 1];
          return (
            <Fragment key={post.id}>
              {/* 최신순에서는 지난번에 본 곳까지 선을 긋는다 (Sprint 41) */}
              {sort === "latest" && prev && <NewDivider room={seenRoom} newer={prev.created_at} older={post.created_at} />}
              <PostCard post={post} showCategory={!category} seenRoom={seenRoom} />
            </Fragment>
          );
        })
      )}
      {page === 1 && !type && !sourced && <MarkSeen room={seenRoom} />}
      <Pagination basePath={basePath} params={params} page={feed.page} pageSize={feed.pageSize} total={feed.total} />
    </>
  );
}
