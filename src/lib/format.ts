import type { TrustTier } from "./types";

export function timeAgo(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "방금 전";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}

export const TIER_LABEL: Record<TrustTier, string | null> = {
  top5: "상위 5%",
  top12: "상위 12%",
  top19: "상위 19%",
  pending: "검증 대기",
  none: null,
};

export const SORT_LABEL = { trust: "신뢰도순", latest: "최신순", votes: "추천순" } as const;
