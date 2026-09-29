import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { BrandAliasPanel } from "@/components/BrandAliasPanel";
import { RenewalList } from "@/components/RenewalList";
import { fingerprint } from "@/lib/fingerprint";
import { aliasesOf, canonicalBrandKey, isBrandKey, listProposals } from "@/lib/repo/brand-aliases";
import { brandHistory as brandHistoryUncached } from "@/lib/repo/renewal-feed";
import { getRule, getRules } from "@/lib/repo/rules";

export const dynamic = "force-dynamic";

const brandHistory = cache(brandHistoryUncached);

type Props = { params: Promise<{ key: string }> };

function decodeKey(raw: string) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return "";
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const h = await brandHistory(decodeKey((await params).key));
  if (!h) return {};
  return {
    title: `${h.brand} 라벨 변경 이력`,
    description: `${h.brand} 제품 ${h.stats.products}개 중 ${h.stats.renewed_products}개에서 라벨 표시값 변경 ${h.stats.renewals}건 — 이용자 제보를 규칙으로 정리한 기록`,
    alternates: { canonical: `/brand/${encodeURIComponent(h.key)}` },
  };
}

/** 브랜드별 라벨 변경 이력 (Sprint 28) + 같은 브랜드의 다른 표기 (Sprint 31) */
export default async function BrandPage({ params }: Props) {
  const key = decodeKey((await params).key);
  // 합쳐진 옛 표기의 주소는 대표 브랜드로
  if (isBrandKey(key)) {
    const canonical = await canonicalBrandKey(key);
    if (canonical !== key) permanentRedirect(`/brand/${encodeURIComponent(canonical)}`);
  }
  const [h, minReports, rules] = await Promise.all([brandHistory(key), getRule("renewal_min_reports"), getRules()]);
  if (!h) notFound();
  const [aliases, proposals] = await Promise.all([aliasesOf(h.key), listProposals(h.key, fingerprint((await headers()) as unknown as Headers))]);
  return (
    <>
      <p className="hint">
        <Link href="/renewals">← 라벨 변경 이력</Link>
      </p>
      <h1 style={{ fontSize: 20, margin: "4px 0 8px" }}>🏭 {h.brand}</h1>
      {aliases.length > 0 && <p className="hint brand-aliases">다른 표기: {aliases.map((a) => a.label).join(" · ")}</p>}
      <p className="post-meta">
        <span>제품 {h.stats.products}개</span>
        <span>라벨 변경 {h.stats.renewals}건 (제품 {h.stats.renewed_products}개)</span>
        {h.stats.renewals > 0 && (
          <span>
            ▼ 줄어듦 {h.stats.decreased} · ▲ 늘어남 {h.stats.increased}
          </span>
        )}
      </p>
      <p className="hint">
        이 브랜드 제품의 라벨 표시값이 바뀐 것으로 보이는 기록이에요. 제조사 발표가 아니라 서로 다른 {minReports}명 이상의 제보를{" "}
        <Link href="/policy">규칙</Link>에 따라 정리한 결과이고, 값이 늘거나 준 것 자체가 좋고 나쁨을 뜻하지는 않아요.
      </p>

      <section aria-labelledby="bh-h">
        <h2 id="bh-h" className="section-h">
          🔄 바뀐 라벨
        </h2>
        {h.renewals.length ? <RenewalList items={h.renewals} showBrand={false} /> : <p className="hint">아직 라벨이 바뀐 것으로 확인된 제품이 없어요.</p>}
      </section>

      {h.pending.length > 0 && (
        <section aria-labelledby="bp-h">
          <h2 id="bp-h" className="section-h">
            🔍 확인이 필요한 제품
          </h2>
          <RenewalList items={h.pending} showBrand={false} minReports={minReports} />
        </section>
      )}

      <section aria-labelledby="bprod-h">
        <h2 id="bprod-h" className="section-h">
          🏷 제품
        </h2>
        <ul className="product-list">
          {h.products.map((p) => (
            <li key={p.id}>
              <Link href={`/p/${p.id}`}>
                <b>{p.name}</b>
              </Link>
              <span className="hint">
                {p.category.name} · 글 {p.post_count}
                {p.renewals > 0 ? ` · 🔄 변경 ${p.renewals}` : ""}
                {p.pending > 0 ? ` · 🔍 확인 중 ${p.pending}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <BrandAliasPanel
        brandKey={h.key}
        brandLabel={h.brand}
        initial={proposals}
        rule={{ score: rules.correction_support_score, ratio: rules.correction_support_ratio }}
      />
    </>
  );
}
