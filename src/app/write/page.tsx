import type { Metadata } from "next";
import { PostEditor } from "@/components/PostEditor";
import { labelReadEnabled } from "@/lib/label-read";
import { parseHead } from "@/lib/heads";
import type { PostType } from "@/lib/types";
import { findTemplate } from "@/lib/onboarding";
import { listCategories } from "@/lib/repo/categories";
import { getProduct } from "@/lib/repo/products";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "글쓰기", robots: { index: false } };

export default async function WritePage({ searchParams }: { searchParams: Promise<{ category?: string; product?: string; template?: string; head?: string; type?: string }> }) {
  const [categories, sp] = await Promise.all([listCategories(), searchParams]);
  // 제품 페이지의 "이 제품 글쓰기" — 그 제품을 미리 태그하고 방도 맞춘다
  const found = sp.product ? await getProduct(sp.product) : null;
  const product = found && !("redirect" in found) ? found : null;
  const initialCategory = product?.category.slug ?? sp.category;
  // 방 안내에서 고른 글쓰기 틀 (Sprint 32)
  const template = findTemplate(sp.template);
  // 방의 탭(자랑·질문… / 정보·정모)에서 누른 글쓰기 — 그 탭으로 미리 맞춘다
  const head = parseHead(sp.head);
  // 🙋 행사 다음 날 "방에 후기 남겨도 좋아요" (10/26): ?type=review → 잡담 "[후기] "
  const review = !head && sp.type === "review";
  const tabType: PostType | undefined = head || review ? "chat" : sp.type === "info" || sp.type === "meetup" ? sp.type : undefined;
  const tab = tabType && { title: head ? `[${head}] ` : review ? "[후기] " : "", body: "", postType: tabType };
  return (
    <>
      <h1 style={{ fontSize: 20, margin: "4px 0 12px" }}>글쓰기</h1>
      {template && (
        <p className="hint template-note" role="note">
          &ldquo;{template.label}&rdquo; 틀로 시작했어요. 빈칸은 직접 확인한 값으로 채우고, 모르는 칸은 지워 주세요.
        </p>
      )}
      <PostEditor
        mode="create"
        labelRead={labelReadEnabled()}
        categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
        initialCategory={categories.some((c) => c.slug === initialCategory) ? initialCategory : undefined}
        initialProduct={product ? { id: product.id, brand: product.brand, name: product.name } : undefined}
        initialTemplate={template ? { title: template.title, body: template.body, postType: template.postType } : tab}
      />
    </>
  );
}
