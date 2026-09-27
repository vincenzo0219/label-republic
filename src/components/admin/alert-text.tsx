import Link from "next/link";
import type { AlertRow } from "@/lib/repo/metrics";

/** 어뷰징 알림 표시 문구 — 운영 대시보드와 모더레이션 화면 공용 */
export const ALERT_LABEL: Record<string, string> = {
  report_burst: "신고 집중",
  vote_burst: "투표 집중",
  board_vote_burst: "보드 투표 집중",
  mass_reporter: "대량 신고자",
};

export function alertSubject(a: Pick<AlertRow, "subject_type" | "subject_id" | "detail">) {
  if (a.subject_type === "post") return <Link href={`/posts/${a.subject_id}`}>글 #{a.subject_id} {typeof a.detail.title === "string" ? `· ${a.detail.title}` : ""}</Link>;
  if (a.subject_type === "board_request") return <Link href="/boards">보드 요청 #{a.subject_id} {typeof a.detail.name === "string" ? `· ${a.detail.name}` : ""}</Link>;
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
    default:
      return JSON.stringify(d);
  }
}
