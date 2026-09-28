import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostEditor } from "@/components/PostEditor";
import { labelReadEnabled } from "@/lib/label-read";
import { getPost } from "@/lib/repo/posts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "글 수정", robots: { index: false } };

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const post = await getPost((await params).id);
  if (!post || post.is_blinded || post.is_ai_curated) notFound();
  return (
    <>
      <h1 style={{ fontSize: 20, margin: "4px 0 16px" }}>글 수정</h1>
      <PostEditor
        mode="edit"
        labelRead={labelReadEnabled()}
        postId={post.id}
        categoryName={post.category.name}
        categorySlug={post.category.slug}
        initial={{ title: post.title, body: post.body, summary: post.summary?.lines ?? null, images: post.images.map((i) => ({ id: i.id, alt: i.alt })), sources: post.sources.map((s) => ({ url: s.url, label: s.label })),
          products: post.products,
          facts: post.facts,
        }}
      />
    </>
  );
}
