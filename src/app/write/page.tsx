import type { Metadata } from "next";
import { PostEditor } from "@/components/PostEditor";
import { listCategories } from "@/lib/repo/categories";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "글쓰기", robots: { index: false } };

export default async function WritePage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const [categories, sp] = await Promise.all([listCategories(), searchParams]);
  return (
    <>
      <h1 style={{ fontSize: 20, margin: "4px 0 16px" }}>글쓰기</h1>
      <PostEditor
        mode="create"
        categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
        initialCategory={categories.some((c) => c.slug === sp.category) ? sp.category : undefined}
      />
    </>
  );
}
