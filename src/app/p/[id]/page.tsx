import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { Pagination } from "@/components/Pagination";
import { PostCard } from "@/components/PostCard";
import { ProductFacts } from "@/components/ProductFacts";
import { WatchToggle } from "@/components/WatchToggle";
import { config } from "@/lib/config";
import { thumbUrl } from "@/lib/media-url";
import { formatValue } from "@/lib/products";
import { listPosts } from "@/lib/repo/posts";
import { getProduct as getProductUncached, productFacts, productPhotos, productSources, type Product } from "@/lib/repo/products";
import { displayHost, SOURCE_KIND_LABEL } from "@/lib/sources";

export const dynamic = "force-dynamic";

const getProduct = cache(getProductUncached);

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> };

async function load(id: string): Promise<Product> {
  const p = await getProduct(id);
  if (!p) notFound();
  // 병합된 제품의 옛 주소는 합쳐진 제품으로
  if ("redirect" in p) permanentRedirect(`/p/${p.redirect}`);
  return p;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getProduct((await params).id);
  if (!p || "redirect" in p) return {};
  const name = `${p.brand} ${p.name}`;
  return {
    title: `${name} — ${p.category.name} 제품`,
    description: `${name}에 대한 라벨공화국 글 ${p.post_count}개의 성분·스펙 수치, 사진, 출처를 모았습니다. 표시값과 실측값을 비교해 보세요.`,
    alternates: { canonical: `/p/${p.id}` },
    openGraph: { type: "website", title: name },
  };
}

export default async function ProductPage({ params, searchParams }: Props) {
  const product = await load((await params).id);
  const page = Number((await searchParams).page) || 1;
  const [facts, photos, sources, posts] = await Promise.all([
    productFacts(product.id),
    productPhotos(product.id),
    productSources(product.id),
    listPosts({ productId: product.id, sort: "trust", page }),
  ]);
  const name = `${product.brand} ${product.name}`;
  const boardPath = `/c/${encodeURIComponent(product.category.slug)}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    brand: { "@type": "Brand", name: product.brand },
    category: product.category.name,
    url: `${config.siteUrl}/p/${product.id}`,
    ...(photos.length ? { image: photos.slice(0, 3).map((i) => `${config.siteUrl}${thumbUrl(i.id)}`) } : {}),
    ...(facts.length
      ? {
          additionalProperty: facts.slice(0, 20).flatMap((g) => {
            const v = g.label ?? g.measured;
            return v ? [{ "@type": "PropertyValue", name: g.basis ? `${g.attribute} (${g.basis})` : g.attribute, value: formatValue(v.median), unitText: g.unit }] : [];
          }),
        }
      : {}),
  };

  return (
    <article className="product-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <p className="hint">
        <Link href={boardPath}>← {product.category.name}</Link> · <Link href={`${boardPath}/products`}>제품 목록</Link>
      </p>
      <header className="post-head">
        <p className="product-brand">{product.brand}</p>
        <h1>{product.name}</h1>
        <div className="post-meta">
          <span>관련 글 {product.post_count}개</span>
          <span>수치 항목 {facts.length}개</span>
        </div>
        <div className="product-actions">
          <WatchToggle kind="product" id={product.id} name={name} />
          <Link className="btn btn-sm" href={`/compare?ids=${product.id}`}>
            ⚖ 다른 제품과 비교
          </Link>
          <Link className="btn btn-sm" href={`/write?category=${encodeURIComponent(product.category.slug)}&product=${product.id}`}>
            ✍ 이 제품 글쓰기
          </Link>
        </div>
      </header>

      <section aria-labelledby="pf-h">
        <h2 id="pf-h" className="section-h">🧪 성분·스펙 수치</h2>
        <ProductFacts groups={facts} />
      </section>

      {photos.length > 0 && (
        <section aria-labelledby="pp-h">
          <h2 id="pp-h" className="section-h">📷 사진 {photos.length}</h2>
          <ul className="gallery gallery-3">
            {photos.map((img) => (
              <li key={img.id}>
                <Link href={`/posts/${img.post_id}`} aria-label={`${img.alt || "제품 사진"} — 글 #${img.post_id}로 이동`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbUrl(img.id)} alt={img.alt || "제품 사진"} width={img.thumb_width} height={img.thumb_height} loading="lazy" decoding="async" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sources.length > 0 && (
        <section className="sources" aria-labelledby="ps-h">
          <h2 id="ps-h">📚 관련 글의 출처 {sources.length}</h2>
          <ol>
            {sources.map((s) => (
              <li key={s.url} className={s.status === "broken" ? "is-broken" : undefined}>
                <span className={`badge badge-src badge-src-${s.kind}`}>{SOURCE_KIND_LABEL[s.kind as keyof typeof SOURCE_KIND_LABEL]}</span>
                <a href={s.url} target="_blank" rel="nofollow ugc noopener noreferrer">
                  {s.label || s.page_title || displayHost(s.host)}
                </a>
                <span className="hint">
                  {displayHost(s.host)}
                  {s.cited > 1 ? ` · 글 ${s.cited}개가 인용` : ""}
                  {s.status === "broken" ? " · ⚠ 최근 확인 시 열리지 않음" : ""}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section aria-labelledby="pl-h">
        <h2 id="pl-h" className="section-h">📝 관련 글</h2>
        {posts.items.map((post) => (
          <PostCard key={post.id} post={post} showCategory={false} />
        ))}
        <Pagination basePath={`/p/${product.id}`} page={posts.page} pageSize={posts.pageSize} total={posts.total} />
      </section>
    </article>
  );
}
