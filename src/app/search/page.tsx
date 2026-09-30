import type { Metadata } from "next";
import { CategoryTabs } from "@/components/CategoryTabs";
import { FactSearchPanel } from "@/components/FactSearchPanel";
import { Pagination } from "@/components/Pagination";
import { PostCard } from "@/components/PostCard";
import { SortBar } from "@/components/SortBar";
import { HttpError } from "@/lib/errors";
import { searchTerms } from "@/lib/highlight";
import { getCategoryBySlug, listCategories } from "@/lib/repo/categories";
import { listPosts } from "@/lib/repo/posts";
import { sortSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = (await searchParams).q?.trim();
  // 검색 결과 페이지는 색인하지 않고, 개별 게시글만 색인되게 한다.
  return { title: q ? `"${q}" 검색 결과` : "검색", robots: { index: false, follow: true } };
}

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const sort = sortSchema.parse(sp.sort);
  const page = Number(sp.page) || 1;
  const category = sp.category ? await getCategoryBySlug(sp.category) : null;
  const sourced = sp.sourced === "1";
  const terms = searchTerms(q);

  let timedOut = false;
  const [categories, results] = await Promise.all([
    listCategories(),
    terms.length
      ? listPosts({ q, sort, page, categoryId: category?.id, sourced }).catch((err) => {
          if (err instanceof HttpError && err.code === "search_timeout") {
            timedOut = true;
            return null;
          }
          throw err;
        })
      : Promise.resolve(null),
  ]);
  const base: Record<string, string> = { q, ...(category ? { category: category.slug } : {}), ...(sourced ? { sourced: "1" } : {}) };
  const srcParam: Record<string, string> = sourced ? { sourced: "1" } : {};

  return (
    <>
      <h1 className="sr-only">{q ? `"${q}" 검색 결과` : "검색"}</h1>
      <form action="/search" method="get" role="search" aria-label="검색어 수정" className="form" style={{ marginBottom: 12 }}>
        <div className="row" style={{ gridTemplateColumns: "1fr auto" }}>
          <input className="input" type="search" name="q" defaultValue={q} placeholder="예: 마그네슘 비스글리시네이트, 저소음 적축" maxLength={100} autoFocus={!q} />
          {category && <input type="hidden" name="category" value={category.slug} />}
          {sourced && <input type="hidden" name="sourced" value="1" />}
          <button className="btn btn-primary" style={{ height: "auto" }}>검색</button>
        </div>
      </form>
      {q && <FactSearchPanel q={q} categories={category ? [category] : categories} />}
      {timedOut ? (
        <div className="empty" role="status">검색이 너무 오래 걸렸습니다. 검색어를 더 구체적으로 입력하거나 보드를 골라 다시 검색해주세요.</div>
      ) : results?.tooShort ? (
        <div className="empty" role="status">두 글자 이상 입력해주세요.</div>
      ) : !results ? (
        <div className="empty">검색어를 입력해주세요. 공백으로 여러 단어를 모두 포함하는 글을 찾습니다.</div>
      ) : (
        <>
          <nav className="tabs" aria-label="카테고리 필터">
            <a className="tab" href={`/search?${new URLSearchParams({ q, ...srcParam, ...(sort !== "trust" ? { sort } : {}) })}`} aria-current={!category ? "true" : undefined}>
              전체
            </a>
            {categories.map((c) => (
              <a
                key={c.slug}
                className="tab"
                href={`/search?${new URLSearchParams({ q, category: c.slug, ...srcParam, ...(sort !== "trust" ? { sort } : {}) })}`}
                aria-current={category?.slug === c.slug ? "true" : undefined}
              >
                {c.name}
              </a>
            ))}
          </nav>
          <nav className="type-filter" aria-label="검색 필터">
            <a
              className="filter-toggle"
              href={`/search?${new URLSearchParams({ q, ...(category ? { category: category.slug } : {}), ...(sourced ? {} : { sourced: "1" }), ...(sort !== "trust" ? { sort } : {}) })}`}
              aria-current={sourced ? "true" : undefined}
              rel="nofollow"
            >
              📚 출처 있는 글만
            </a>
          </nav>
          <SortBar basePath="/search" params={base} sort={sort} total={results.total} capped={results.totalCapped} />
          {results.items.length === 0 ? (
            <div className="empty">
              “{q}”에 대한 결과가 없습니다.
              <br />
              <a className="btn btn-sm" style={{ marginTop: 12 }} href="/write">직접 질문 올리기</a>
            </div>
          ) : (
            results.items.map((post) => <PostCard key={post.id} post={post} terms={terms} />)
          )}
          <Pagination
            basePath="/search"
            params={{ ...base, ...(sort !== "trust" ? { sort } : {}) }}
            page={results.page}
            pageSize={results.pageSize}
            total={results.total}
            capped={results.totalCapped}
          />
        </>
      )}
      {/* 탭 컴포넌트는 검색 결과가 없을 때도 카테고리 탐색을 돕기 위해 노출 */}
      {!results && <CategoryTabs categories={categories} />}
    </>
  );
}
