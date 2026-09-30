/** 리뉴얼 문구 (Sprint 28) — 화면·피드 공용 */
import { formatValue } from "./products";
import { changePeriodText } from "./renewals";
import type { RenewalItem } from "./repo/renewal-feed";

export function pctText(p: number | null): string {
  if (p === null) return "";
  const r = Math.round(Math.abs(p));
  return r === 0 ? "" : `${p > 0 ? "+" : "−"}${r}%`;
}

/** 바뀐 시기 문구 — 라벨 날짜로 잡았으면 "제조 …", 아니면 글 올린 시기로 추정했음을 밝힌다 */
export function renewalWhen(r: Pick<RenewalItem, "last_old_at" | "first_new_at" | "time_basis">): string {
  const period = changePeriodText(new Date(r.last_old_at).getTime(), new Date(r.first_new_at).getTime());
  return r.time_basis === "made" ? `제조 ${period}에 바뀜` : `${period}에 바뀜 (글 올린 시기로 추정)`;
}

/** 리뉴얼 한 건의 한 줄 요약 (피드 제목 등) */
export function renewalTitle(r: RenewalItem): string {
  const what = r.basis ? `${r.attribute}(${r.basis})` : r.attribute;
  const pct = pctText(r.change_pct);
  return `${r.product.brand} ${r.product.name}: ${what} ${formatValue(r.from)} → ${formatValue(r.to)} ${r.unit}${pct ? ` (${pct})` : ""}`;
}

