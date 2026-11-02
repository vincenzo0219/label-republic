import { ImageResponse } from "next/og";
import type { FriendCard } from "../friendLink";
import { cardFonts } from "./fonts";

/** 이모지는 뺀다: 이미지 렌더러가 이모지 그림을 외부 CDN 에서 받아 오는데, 막히면 카드 전체가 실패한다 */
const noEmoji = (s: string) => s.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F1E6}-\u{1F1FF}]/gu, "").replace(/\s+/g, " ").trim();

const C = { bg: "#1f5f4a", text: "#ffffff", soft: "rgba(255,255,255,0.8)", chip: "rgba(255,255,255,0.16)" };

/** 🤝 친구 대결·궁합 링크 미리보기 카드 (1200×630). 카톡에 붙이면 친구 기록이 바로 보인다 */
export async function renderFriendCard(raw: FriendCard, siteHost: string): Promise<ImageResponse> {
  const card = { kicker: noEmoji(raw.kicker), headline: noEmoji(raw.headline), sub: noEmoji(raw.sub) };
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: C.bg, color: C.text, fontFamily: "Pretendard", wordBreak: "keep-all" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", padding: "8px 22px", borderRadius: 999, background: C.chip, fontSize: 30, fontWeight: 700 }}>{card.kicker}</div>
        </div>
        <div style={{ display: "flex", fontSize: 76, fontWeight: 700, lineHeight: 1.2, letterSpacing: -2 }}>{card.headline}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", fontSize: 38, color: C.soft }}>{card.sub}</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ display: "flex", fontSize: 40, fontWeight: 700 }}>노방장</div>
            <div style={{ display: "flex", fontSize: 24, color: C.soft }}>{siteHost}</div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: await cardFonts(), headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } },
  );
}
