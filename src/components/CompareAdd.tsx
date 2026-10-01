"use client";

import { useRouter } from "next/navigation";
import { ProductSearchBox } from "./ProductSearchBox";

/** 비교 표에 제품 추가 — 같은 방 제품만 찾는다 */
export function CompareAdd({ ids, category }: { ids: string[]; category: string }) {
  const router = useRouter();
  return (
    <ProductSearchBox
      category={category}
      label="비교할 제품 추가"
      placeholder="비교할 제품 검색"
      exclude={ids}
      onPick={(p) => router.push(`/compare?ids=${[...ids, p.id].join(",")}`)}
    />
  );
}
