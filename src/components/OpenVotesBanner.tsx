import Link from "next/link";
import { listProposals } from "@/lib/repo/rules";
import { formatRule, RULES } from "@/lib/rules";

/** 진행 중인 규칙 투표 안내 (홈) — 규칙은 참여하는 사람이 정하므로 눈에 띄게 */
export async function OpenVotesBanner() {
  const open = await listProposals({ status: "open", limit: 3 });
  if (!open.length) return null;
  const p = open[0]!;
  return (
    <Link href={`/rules#proposal-${p.id}`} className="rules-banner">
      🗳 규칙 투표 진행 중: <b>{RULES[p.rule_key].label}</b> {formatRule(p.rule_key, p.from_value)} → {formatRule(p.rule_key, p.to_value)}
      {RULES[p.rule_key].unit}
      {open.length > 1 && ` 외 ${open.length - 1}건`} — 참여하기 →
    </Link>
  );
}
