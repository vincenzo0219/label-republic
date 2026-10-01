import Link from "next/link";
import type { AlertRow } from "@/lib/repo/metrics";
import { formatRule, isRuleKey, RULES } from "@/lib/rules";

/** 어뷰징 알림 표시 문구 — 운영 대시보드와 모더레이션 화면 공용 */
export const ALERT_LABEL: Record<string, string> = {
  report_burst: "신고 집중",
  vote_burst: "투표 집중",
  board_vote_burst: "방 투표 집중",
  mass_reporter: "대량 신고자",
  rule_vote_ring: "규칙 투표 조작 의심",
};

export function alertSubject(a: Pick<AlertRow, "subject_type" | "subject_id" | "detail">) {
  if (a.subject_type === "post") return <Link href={`/posts/${a.subject_id}`}>글 #{a.subject_id} {typeof a.detail.title === "string" ? `· ${a.detail.title}` : ""}</Link>;
  if (a.subject_type === "rule_proposal") {
    const d = a.detail as { rule?: string; from?: number; to?: number };
    const label = d.rule && isRuleKey(d.rule) ? `${RULES[d.rule].label} ${formatRule(d.rule, d.from ?? 0)} → ${formatRule(d.rule, d.to ?? 0)}` : "";
    return <Link href={`/rules#proposal-${a.subject_id}`}>규칙 제안 #{a.subject_id} {label && `· ${label}`}</Link>;
  }
  if (a.subject_type === "board_request") return <Link href="/boards">방 요청 #{a.subject_id} {typeof a.detail.name === "string" ? `· ${a.detail.name}` : ""}</Link>;
  return <code>{a.subject_id}…</code>;
}

export function alertSummary(a: Pick<AlertRow, "kind" | "detail">) {
  const d = a.detail as Record<string, number | string | boolean | null>;
  switch (a.kind) {
    case "report_burst":
      return `15분 내 신고 ${d.reports}건 중 ${d.fromNewFingerprints}건이 갓 생긴 fingerprint${d.blinded ? " · 블라인드됨" : ""}`;
    case "vote_burst":
      return `15분 내 투표 ${d.votes}건 중 ${d.fromNewFingerprints}건이 갓 생긴 fingerprint (현재 ▲${d.upvotes} ▼${d.downvotes})`;
    case "board_vote_burst":
      return `15분 내 투표 ${d.votes}건 중 ${d.fromNewFingerprints}건이 갓 생긴 fingerprint · 상태 ${d.status}`;
    case "mass_reporter":
      return `최근 1시간 신고 ${d.reportsLastHour}건 · ${d.note}`;
    case "rule_vote_ring":
      return (
        `의심 표 ${d.flagged}개 (찬성 ${d.flaggedYes} · 반대 ${d.flaggedNo}) — 자격을 갓 채운 계정 ${d.freshEligible} · 같은 망의 새 계정 ${d.sameNetwork}` +
        (d.flipsOutcome ? " · ⚠️ 이 표들을 빼면 결과가 바뀜" : "") +
        " · 검토 전까지 마감 보류(최대 3일)"
      );
    default:
      return JSON.stringify(d);
  }
}
