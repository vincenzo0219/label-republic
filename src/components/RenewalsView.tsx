import Link from "next/link";
import { listCategories } from "@/lib/repo/categories";
import { listRenewals, topRenewalBrands, type RenewalStatus } from "@/lib/repo/renewal-feed";
import { getRule } from "@/lib/repo/rules";
import type { Category } from "@/lib/types";
import { Pagination } from "./Pagination";
import { RenewalList } from "./RenewalList";

/** 리뉴얼 이력 — 전체(/renewals)·보드별(/c/:slug/renewals) 공용 (Sprint 28) */
export async function RenewalsView({ category, status, page }: { category?: Category; status: RenewalStatus; page: number }) {
  const [categories, list, pendingCount, brands, minReports] = await Promise.all([
    listCategories(),
    listRenewals({ status, categoryId: category?.id, page }),
    status === "confirmed" ? listRenewals({ status: "pending", categoryId: category?.id, pageSize: 1 }).then((r) => r.total) : Promise.resolve(0),
    status === "confirmed" ? topRenewalBrands({ categoryId: category?.id, limit: 10 }) : Promise.resolve([]),
    getRule("renewal_min_reports"),
  ]);
  const base = category ? `/c/${encodeURIComponent(category.slug)}/renewals` : "/renewals";
  const feed = `${base}.xml`;
  const params: Record<string, string> = status === "pending" ? { status: "pending" } : {};
  return (
    <>
      {category && (
        <p className="hint">
          <Link href={`/c/${encodeURIComponent(category.slug)}`}>← {category.name}</Link> · <Link href={`/c/${encodeURIComponent(category.slug)}/products`}>🏷 제품별</Link>
        </p>
      )}
      <h1 style={{ fontSize: 20, margin: "4px 0 8px" }}>🔄 {category ? `${category.name} ` : ""}라벨 변경 이력</h1>
      <p className="hint" style={{ marginTop: 0 }}>
        같은 제품의 라벨 표시값이 바뀐 것으로 보이는 기록이에요. 제조사 발표가 아니라, 서로 다른 {minReports}명 이상이 바뀐 값을 올리면{" "}
        <Link href="/policy">규칙</Link>에 따라 자동으로 정리됩니다. 틀린 값은 해당 글에 정정 제안을 남겨 주세요.{" "}
        <a href={feed} type="application/atom+xml">
          📡 RSS(Atom)로 구독
        </a>
      </p>

      <nav className="chips" aria-label="보드" style={{ margin: "10px 0" }}>
        <Link className="chip chip-sm" href={status === "pending" ? "/renewals?status=pending" : "/renewals"} aria-current={!category ? "page" : undefined}>
          전체
        </Link>
        {categories.map((c) => (
          <Link
            key={c.slug}
            className="chip chip-sm"
            href={`/c/${encodeURIComponent(c.slug)}/renewals${status === "pending" ? "?status=pending" : ""}`}
            aria-current={category?.slug === c.slug ? "page" : undefined}
          >
            {c.name}
          </Link>
        ))}
      </nav>

      <nav className="tabs" aria-label="상태">
        <Link href={base} className="tab" aria-current={status === "confirmed" ? "page" : undefined}>
          바뀐 제품
        </Link>
        <Link href={`${base}?status=pending`} className="tab" aria-current={status === "pending" ? "page" : undefined}>
          🔍 확인이 필요한 제품{status === "confirmed" && pendingCount > 0 ? ` ${pendingCount}` : ""}
        </Link>
      </nav>

      {status === "pending" && (
        <p className="notice" style={{ margin: "10px 0" }}>
          최근 글이 지금 라벨과 다른 값을 적었지만 아직 기준({minReports}명)에 못 미친 제품이에요. 제품을 갖고 있다면 제품 페이지에서 라벨(제조일자 부분 포함)을 찍어 올려 주세요.
        </p>
      )}

      {list.items.length === 0 ? (
        <div className="empty">
          <p>{status === "pending" ? "지금 확인이 필요한 제품이 없어요." : "아직 라벨이 바뀐 것으로 확인된 제품이 없어요."}</p>
        </div>
      ) : (
        <RenewalList items={list.items} showBoard={!category} minReports={minReports} />
      )}
      <Pagination basePath={base} params={params} page={list.page} pageSize={list.pageSize} total={list.total} />

      {brands.length > 0 && (
        <section aria-labelledby="rb-h" style={{ marginTop: 20 }}>
          <h2 id="rb-h" className="section-h">
            🏭 라벨 변경이 확인된 브랜드
          </h2>
          <ul className="brand-counts">
            {brands.map((b) => (
              <li key={b.key}>
                <Link href={`/brand/${encodeURIComponent(b.key)}`}>{b.brand}</Link>{" "}
                <span className="hint">
                  변경 {b.renewals}건 · 제품 {b.products}개
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export function renewalStatus(raw: string | undefined): RenewalStatus {
  return raw === "pending" ? "pending" : "confirmed";
}
