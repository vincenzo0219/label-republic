import { config } from "@/lib/config";
import { atomResponse, buildRenewalAtom } from "@/lib/feed";
import { listRenewals } from "@/lib/repo/renewal-feed";

export const dynamic = "force-dynamic";

/** GET /renewals.xml — 최근 확인된 라벨 변경 (Sprint 28) */
export async function GET() {
  const { items } = await listRenewals({ status: "confirmed", pageSize: 50 });
  return atomResponse(
    buildRenewalAtom({
      id: `${config.siteUrl}/renewals.xml`,
      title: "노방장 — 라벨 변경 이력",
      selfUrl: `${config.siteUrl}/renewals.xml`,
      siteUrl: config.siteUrl,
      alternateUrl: `${config.siteUrl}/renewals`,
      items,
    }),
  );
}
