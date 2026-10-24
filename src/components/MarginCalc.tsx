"use client";

import { useState } from "react";
import { calcMargin, formatInput, parseNum } from "@/lib/marginCalc";

type Key = "buyAmount" | "loan" | "qty" | "price" | "maintenancePct" | "discountPct";

const FIELDS: { key: Key; label: string; unit: string }[] = [
  { key: "buyAmount", label: "매수금액", unit: "원" },
  { key: "loan", label: "신용(대출) 금액", unit: "원" },
  { key: "qty", label: "보유 수량", unit: "주" },
  { key: "price", label: "현재가", unit: "원" },
  { key: "maintenancePct", label: "담보유지비율", unit: "%" },
  { key: "discountPct", label: "반대매매 호가 할인율", unit: "%" },
];

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const pct = (n: number) => `${n.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`;

/** 반대매매 계산기: 브라우저에서만 계산, 저장·전송 없음 */
export function MarginCalc() {
  const [v, setV] = useState<Record<Key, string>>({
    buyAmount: "", loan: "", qty: "", price: "", maintenancePct: "140", discountPct: "20",
  });
  const r = calcMargin({
    buyAmount: parseNum(v.buyAmount),
    loan: parseNum(v.loan),
    qty: parseNum(v.qty),
    price: parseNum(v.price),
    maintenancePct: parseNum(v.maintenancePct),
    discountPct: parseNum(v.discountPct),
  });

  return (
    <div className="ear-card mc">
      <h1 className="ear-title">반대매매 계산기</h1>
      <div className="mc-grid">
        {FIELDS.map((f) => (
          <label key={f.key} className="field">
            <span>{f.label}</span>
            <span className="mc-input">
              <input
                className="input"
                inputMode={f.unit === "%" ? "decimal" : "numeric"}
                autoComplete="off"
                value={v[f.key]}
                onChange={(e) => setV((s) => ({ ...s, [f.key]: formatInput(e.target.value) }))}
              />
              <i>{f.unit}</i>
            </span>
          </label>
        ))}
      </div>

      <dl className="mc-out" aria-live="polite">
        <div>
          <dt>현재 담보비율</dt>
          <dd className={r?.below ? "mc-bad" : undefined}>{r ? pct(r.ratioPct) : "-"}</dd>
        </div>
        <div>
          <dt>반대매매 시작가</dt>
          <dd>{r ? won(r.callPrice) : "-"}</dd>
        </div>
        <div>
          <dt>현재가 대비</dt>
          <dd>{r ? (r.below ? "이미 미달" : `${pct(r.dropPct)} 하락 시`) : "-"}</dd>
        </div>
        <div>
          <dt>부족 금액</dt>
          <dd className={r?.below ? "mc-bad" : undefined}>{r ? (r.below ? won(r.shortfall) : "없음") : "-"}</dd>
        </div>
        <div>
          <dt>예상 처분 수량</dt>
          <dd>
            {r ? (r.below ? `${r.sellQty.toLocaleString("ko-KR")}주${r.capped ? " (전량)" : ""}` : "0주") : "-"}
          </dd>
        </div>
        {r && r.below && (
          <div>
            <dt>예상 처분 금액</dt>
            <dd>{won(r.saleAmount)}</dd>
          </div>
        )}
        {r && r.profit !== null && (
          <div>
            <dt>평가손익</dt>
            <dd>{`${r.profit > 0 ? "+" : ""}${won(r.profit)}`}</dd>
          </div>
        )}
      </dl>
      <p className="mc-formula">처분가 = 현재가×(1−할인율) 기준{r ? `, ${won(r.salePrice)}` : ""}</p>
      <p className="mc-note">증권사마다 기준이 달라요. 실제 금액은 증권사 앱에서 확인하세요.</p>
    </div>
  );
}
