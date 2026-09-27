import { ImageResponse } from "next/og";
import { TIER_LABEL } from "../format";
import type { PostDetail } from "../types";
import { cardFonts } from "./fonts";

export const CARD_SIZES = {
  og: { width: 1200, height: 630 },
  square: { width: 1080, height: 1080 },
} as const;
export type CardFormat = keyof typeof CARD_SIZES;

const C = { bg: "#f6f5f1", surface: "#ffffff", text: "#1c1b19", muted: "#6b6760", brand: "#1f5f4a", line: "#e4e1da", gold: "#a16207", goldBg: "#fef3c7" };

function clip(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** 3줄 요약 카드뷰 이미지 — OG 이미지와 SNS 공유용 */
export async function renderPostCard(post: PostDetail, format: CardFormat, siteHost: string): Promise<ImageResponse> {
  const { width, height } = CARD_SIZES[format];
  const square = format === "square";
  const lines = post.summary?.lines ?? [clip(post.excerpt, 90)];
  const tier = TIER_LABEL[post.trust_tier];
  const showTier = tier && post.trust_tier !== "pending";

  return new ImageResponse(
    (
      <div style={{ width, height, display: "flex", flexDirection: "column", justifyContent: square ? "space-between" : "flex-start", background: C.bg, padding: square ? 72 : 56, fontFamily: "Pretendard", color: C.text, wordBreak: "keep-all" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: square ? 28 : 24 }}>
          <div style={{ display: "flex", padding: "6px 16px", borderRadius: 999, border: `2px solid ${C.line}`, color: C.muted, fontWeight: 700 }}>{post.category.name}</div>
          {showTier && (
            <div style={{ display: "flex", padding: "6px 16px", borderRadius: 999, background: C.goldBg, color: C.gold, fontWeight: 700 }}>
              {`✔ 신뢰도 ${tier}`}
            </div>
          )}
          {post.is_ai_curated && (
            <div style={{ display: "flex", padding: "6px 16px", borderRadius: 999, background: "#e3efe9", color: C.brand, fontWeight: 700 }}>AI 큐레이터</div>
          )}
        </div>

        <div style={{ display: "flex", fontSize: square ? 60 : 52, fontWeight: 700, lineHeight: 1.25, marginTop: square ? 0 : 28, letterSpacing: -1 }}>
          {clip(post.title, square ? 48 : 40)}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: square ? 26 : 16,
            marginTop: square ? 0 : 28,
            padding: square ? "40px 44px" : "28px 32px",
            background: C.surface,
            borderRadius: 28,
            border: `2px solid ${C.line}`,
            flexGrow: square ? 0 : 1,
          }}
        >
          <div style={{ display: "flex", fontSize: square ? 26 : 22, fontWeight: 700, color: C.brand }}>3줄 요약</div>
          {lines.map((line, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 18, fontSize: square ? 36 : 30, lineHeight: 1.4 }}>
              <div style={{ display: "flex", flexShrink: 0, width: square ? 44 : 38, height: square ? 44 : 38, borderRadius: 10, background: C.brand, color: "#fff", alignItems: "center", justifyContent: "center", fontSize: square ? 24 : 20, fontWeight: 700, marginTop: 4 }}>
                {String(i + 1)}
              </div>
              <div style={{ display: "flex" }}>{clip(line, square ? 70 : 60)}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: square ? 0 : 24, fontSize: square ? 28 : 24, color: C.muted }}>
          <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
            <span style={{ fontWeight: 700, color: C.text, fontSize: square ? 34 : 28 }}>라벨공화국</span>
            <span>방장 없는 성분 팩트체크</span>
          </div>
          <div style={{ display: "flex" }}>{`${siteHost}/posts/${post.id}`}</div>
        </div>
      </div>
    ),
    {
      width,
      height,
      fonts: await cardFonts(),
      headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" },
    },
  );
}
