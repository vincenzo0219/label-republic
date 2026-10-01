import { TIER_LABEL } from "@/lib/format";
import type { TrustTier } from "@/lib/types";

/** 카테고리별 신뢰도 배지 — 전체 등급이 아니라 해당 방 안에서의 상위 % */
export function TrustBadge({ tier, categoryName }: { tier: TrustTier; categoryName?: string }) {
  const label = TIER_LABEL[tier];
  if (!label) return null;
  // "검증 대기"는 표시하지 않는다 (Sprint 42) — 커뮤니티 글 대부분이 여기에 머물러 모든 글에 붙어 보였다.
  // 추천이 쌓여 상위 구간에 들면 그때 신뢰도 배지가 붙는다.
  if (tier === "pending") return null;
  return (
    <span className={`badge badge-${tier}`} title="최근 30일 이 방 글 중 순추천 기준 구간">
      ✔ {categoryName ? `${categoryName} 신뢰도 ` : "신뢰도 "}
      {label}
    </span>
  );
}

export function AiBadge() {
  return (
    <span className="badge badge-ai" title="AI 큐레이터가 작성한 글입니다.">
      🤖 AI 큐레이터
    </span>
  );
}
