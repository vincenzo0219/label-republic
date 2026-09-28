import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getCategoryBySlug as getCategoryUncached } from "@/lib/repo/categories";
import { listBoardProducts } from "@/lib/repo/products";

export const dynamic = "force-dynamic";

const getCategoryBySlug = cache(getCategoryUncached);

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> };

function decodeSlug(raw: string) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = await getCategoryBySlug(decodeSlug((await params).slug));
  if (!category) return {};
  return {
    title: `${category.name} 제품 목록`,
    description: `${category.name} 보드 글에 태그된 제품과 성분·스펙 수치 모음`,
    alternates: { canonical: `/c/${encodeURIComponent(category.slug)}/products` },
  };
}

export default async function BoardProductsPage({ params, searchParams }: Props) {
  const category = await getCategoryBySlug(decodeSlug((await params).slug));
  if (!category) notFound();
  const page = Math.min(100, Math.max(1, Number((await searchParams).page) || 1));
  const { items, hasMore } = await listBoardProducts(category.id, page);
  const base = `/c/${encodeURIComponent(category.slug)}`;
  return (
    <>
      <p className="hint">
        <Link href={base}>← {category.name}</Link>
      </p>
      <h1 style={{ fontSize: 20, margin: "4px 0 12px" }}>🏷 {category.name} 제품</h1>
      {items.length === 0 ? (
        <div className="empty">
          <p>아직 제품을 태그한 글이 없습니다. 글을 쓸 때 제품을 태그하면 여기에 모입니다.</p>
        </div>
      ) : (
        // JS 없이도 동작: 체크한 제품을 /compare?ids=…&ids=… 로 보낸다
        <form action="/compare" method="get" className="product-list-form">
          <ul className="product-list">
            {items.map((p) => (
              <li key={p.id}>
                <input type="checkbox" name="ids" value={p.id} id={`cmp-${p.id}`} aria-label={`${p.brand} ${p.name} 비교에 넣기`} />
                <Link href={`/p/${p.id}`}>
                  <span className="product-brand">{p.brand}</span> <b>{p.name}</b>
                </Link>
                <span className="hint">
                  글 {p.post_count}
                  {p.fact_count > 0 ? ` · 수치 ${p.fact_count}` : ""}
                </span>
              </li>
            ))}
          </ul>
          <div className="sticky-submit">
            <button className="btn btn-primary">⚖ 선택한 제품 비교 (최대 3개)</button>
          </div>
        </form>
      )}
      <nav className="pagination" aria-label="페이지">
        {page > 1 && (
          <Link className="btn btn-sm" href={page === 2 ? `${base}/products` : `${base}/products?page=${page - 1}`} rel="prev">
            ← 이전
          </Link>
        )}
        {hasMore && page < 100 && (
          <Link className="btn btn-sm" href={`${base}/products?page=${page + 1}`} rel="next">
            다음 →
          </Link>
        )}
      </nav>
    </>
  );
}
