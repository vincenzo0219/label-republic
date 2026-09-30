import Link from "next/link";
import { formatValue } from "@/lib/products";
import { listRenewals } from "@/lib/repo/renewal-feed";

/** 홈: 최근 2주 안에 확인된 라벨 변경 (Sprint 28) */
export async function RenewalsBanner() {
  const { items, total } = await listRenewals({ status: "confirmed", since: new Date(Date.now() - 14 * 24 * 3600_000), pageSize: 1 });
  const r = items[0];
  if (!r) return null;
  return (
    <Link href="/renewals" className="rules-banner renewals-banner">
      🔄 최근 라벨 변경: <b>{r.product.brand} {r.product.name}</b> {r.attribute} {formatValue(r.from)}→{formatValue(r.to)}
      {r.unit}
      {total > 1 && ` 외 ${total - 1}건`} — 이력 보기 →
    </Link>
  );
}
