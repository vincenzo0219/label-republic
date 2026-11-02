"use client";

import { useState } from "react";
import { SITE } from "@/lib/friendLink";
import { savingsPrincipal, wonText as won } from "@/lib/roomPlay";
import { FriendLink } from "./FriendLink";

/** 💰 적립 습관 카드 (11/2, 적립식 투자방 🧩 놀이 탭): 매달 넣는 돈 × 12·36·60개월. 수익률 가정 없이 원금만 */
export function SavingsCard() {
  const [raw, setRaw] = useState("300000");
  const monthly = Number(raw.replace(/[^\d]/g, "")) || 0;
  const rows = savingsPrincipal(monthly);
  return (
    <section className="ear-card tt-test tt-embedded">
      <p className="ear-kicker">💰 적립 습관 카드</p>
      <h2 className="ear-title">매달 꾸준히 넣으면?</h2>
      <label className="tt-field">
        <span>매달 넣는 돈 (원)</span>
        <input inputMode="numeric" className="input" value={raw} maxLength={11} onChange={(e) => setRaw(e.target.value.replace(/[^\d]/g, ""))} aria-label="매달 넣는 돈" />
      </label>
      <div className="tt-card">
        <p className="tt-card-kicker">💰 원금 기준</p>
        <ul className="tt-savings">
          {rows.map((r) => (
            <li key={r.months}>
              <span>{r.months / 12}년 ({r.months}개월)</span>
              <b>{won(r.total)}</b>
            </li>
          ))}
        </ul>
        <p className="tt-card-what">매달 {won(monthly)}씩, 넣은 돈만 더한 값이에요.</p>
        <p className="tt-card-site">노방장 · nobangjang.com</p>
      </div>
      <p className="hint tt-note">수익률은 넣지 않은 원금 기준이에요. 종목·상품 추천이 아니에요.</p>
      <FriendLink
        className="btn"
        label="📤 적립 다짐 공유"
        text={`💰 매달 ${won(monthly)}씩, 5년이면 원금 ${won(monthly * 60)}. 같이 꾸준히 적립해요!`}
        makeUrl={() => `${SITE}/c/${encodeURIComponent("적립식-투자방")}?tab=play&from=share`}
        click="savings-card-share"
      />
    </section>
  );
}
