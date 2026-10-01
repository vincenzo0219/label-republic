import type { Metadata } from "next";
import { PostEditor } from "@/components/PostEditor";
import { labelReadEnabled } from "@/lib/label-read";
import { findTemplate } from "@/lib/onboarding";
import { listCategories } from "@/lib/repo/categories";
import { getProduct } from "@/lib/repo/products";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "글쓰기", robots: { index: false } };

export default async function WritePage({ searchParams }: { searchParams: Promise<{ category?: string; product?: string; template?: string }> }) {
  const [categories, sp] = await Promise.all([listCategories(), searchParams]);
  // 제품 페이지의 "이 제품 글쓰기" — 그 제품을 미리 태그하고 방도 맞춘다
  const found = sp.product ? await getProduct(sp.product) : null;
  const product = found && !("redirect" in found) ? found : null;
  const initialCategory = product?.category.slug ?? sp.category;
  // 방 안내에서 고른 글쓰기 틀 (Sprint 32)
  const template = findTemplate(sp.template);
  return (
    <>
      <h1 style={{ fontSize: 20, margin: "4px 0 12px" }}>글쓰기</h1>
      {template && (
        <p className="hint template-note" role="note">
          &ldquo;{template.label}&rdquo; 틀로 시작했어요. 빈칸은 직접 확인한 값으로 채우고, 모르는 칸은 지워 주세요.
        </p>
      )}
      <details className="first-guide">
        <summary>✍️ 좋은 글 체크리스트</summary>
        <ul>
          <li>
            <b>제품을 태그</b>하세요 — 같은 제품 글이 모여 제품 페이지·비교표·라벨 변경 이력이 됩니다.
          </li>
          <li>
            <b>라벨 사진</b>을 올리면 성분·수치를 읽어 채워 줘요. 사진 속 위치·기기 정보는 저장 전에 지웁니다.
          </li>
          <li>
            <b>숫자는 기준과 함께</b> — &ldquo;1정당&rdquo;, &ldquo;100g당&rdquo;처럼. 실측이면 측정 방법도.
          </li>
          <li>
            <b>출처</b>(논문·제조사 문서·기사 링크)를 붙이면 &ldquo;📚 출처 있는 글&rdquo;로 모입니다.
          </li>
          <li>
            <b>비밀번호 4자리</b>를 기억해 두세요 — 글 수정·삭제·정정 제안 답변에 필요해요.
          </li>
        </ul>
      </details>
      <PostEditor
        mode="create"
        labelRead={labelReadEnabled()}
        categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
        initialCategory={categories.some((c) => c.slug === initialCategory) ? initialCategory : undefined}
        initialProduct={product ? { id: product.id, brand: product.brand, name: product.name } : undefined}
        initialTemplate={template ? { title: template.title, body: template.body, postType: template.postType } : undefined}
      />
    </>
  );
}
