import Link from "next/link";
import { formatValue } from "@/lib/products";
import { pctText, renewalWhen } from "@/lib/renewal-text";
import type { RenewalItem } from "@/lib/repo/renewal-feed";

const DATE = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" });

/**
 * 리뉴얼 목록 (Sprint 28). showBoard: 전체 목록에서 방 이름도 보여줄지, showBrand: 브랜드 페이지 링크
 * minReports: "확인 중" 항목에 몇 명이 더 필요한지 알려 줄 때
 */
export function RenewalList({ items, showBoard = true, showBrand = true, minReports }: { items: RenewalItem[]; showBoard?: boolean; showBrand?: boolean; minReports?: number }) {
  return (
    <ol className="renewal-list">
      {items.map((r) => {
        const pct = pctText(r.change_pct);
        const down = r.to < r.from;
        return (
          <li key={r.id} className="renewal-item">
            <div className="renewal-product">
              {showBoard && <span className="badge">{r.category.name}</span>}{" "}
              {showBrand ? (
                <Link href={`/brand/${encodeURIComponent(r.brand_key)}`} className="product-brand">
                  {r.product.brand}
                </Link>
              ) : (
                <span className="product-brand">{r.product.brand}</span>
              )}{" "}
              <Link href={`/p/${r.product.id}`}>
                <b>{r.product.name}</b>
              </Link>
            </div>
            <p className="renewal-change">
              {r.attribute}
              {r.basis && <span className="hint"> ({r.basis})</span>}: {formatValue(r.from)} → <b>{formatValue(r.to)} {r.unit}</b>
              {pct && <span className={down ? "renewal-pct is-down" : "renewal-pct is-up"}> {down ? "▼" : "▲"} {pct}</span>}
            </p>
            <p className="hint renewal-meta">
              {renewalWhen(r)}
              {r.status === "confirmed" && r.confirmed_at && <> · {DATE.format(new Date(r.confirmed_at))} 확인</>} · {r.status === "confirmed" ? "새 값" : "다른 값"} 글 {r.new_reports}개(작성자 {r.new_authors}명
              {r.new_photos ? `, 📷 사진 근거 ${r.new_photos}` : ""})
              {r.status === "pending" && minReports !== undefined && r.new_authors < minReports && <> · 다른 이용자 {minReports - r.new_authors}명이 더 같은 값을 올리면 반영</>}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
