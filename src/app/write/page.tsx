import type { Metadata } from "next";
import { PostEditor } from "@/components/PostEditor";
import { listCategories } from "@/lib/repo/categories";
import { getProduct } from "@/lib/repo/products";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "글쓰기", robots: { index: false } };

export default async function WritePage({ searchParams }: { searchParams: Promise<{ category?: string; product?: string }> }) {
  const [categories, sp] = await Promise.all([listCategories(), searchParams]);
  // 제품 페이지의 "이 제품 글쓰기" — 그 제품을 미리 태그하고 보드도 맞춘다
  const found = sp.product ? await getProduct(sp.product) : null;
  const product = found && !("redirect" in found) ? found : null;
  const initialCategory = product?.category.slug ?? sp.category;
  return (
    <>
      <h1 style={{ fontSize: 20, margin: "4px 0 16px" }}>글쓰기</h1>
      <PostEditor
        mode="create"
        categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
        initialCategory={categories.some((c) => c.slug === initialCategory) ? initialCategory : undefined}
        initialProduct={product ? { id: product.id, brand: product.brand, name: product.name } : undefined}
      />
    </>
  );
}
