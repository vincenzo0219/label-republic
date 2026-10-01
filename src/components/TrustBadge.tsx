import { TIER_LABEL } from "@/lib/format";
import type { TrustTier } from "@/lib/types";

/** 카테고리별 신뢰도 배지 — 전체 등급이 아니라 해당 방 안에서의 상위 % */
export function TrustBadge({ tier, categoryName }: { tier: TrustTier; categoryName?: string }) {
  const label = TIER_LABEL[tier];
  if (!label) return null;
  if (tier === "pending") {
    return (
      <span className="badge badge-pending" title="게시 24시간 미만이거나 투표 수가 부족해 아직 검증 중입니다.">
        ⏳ {label}
      </span>
    );
  }
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
