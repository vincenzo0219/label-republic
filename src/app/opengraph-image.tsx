import { ImageResponse } from "next/og";
import { cardFonts } from "@/lib/og/fonts";

export const alt = "노방장 — 방장 없는 덕후 커뮤니티";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BOARDS = ["이어폰·오디오 덕후방", "영양제 성분분석", "기계식 키보드&스위치", "데스크테리어", "반려동물 사료 성분분석"];

export default async function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#1f5f4a", color: "#fff", fontFamily: "Pretendard" }}>
        <div style={{ display: "flex", fontSize: 36, opacity: 0.8 }}>방장 없는 덕후 커뮤니티</div>
        <div style={{ display: "flex", fontSize: 104, fontWeight: 700, letterSpacing: -3, marginTop: 8 }}>노방장</div>
        <div style={{ display: "flex", fontSize: 40, marginTop: 16 }}>방장 없이, 정보는 죽지 않고, 신뢰만 남는다</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 48 }}>
          {BOARDS.map((b) => (
            <div key={b} style={{ display: "flex", padding: "8px 20px", borderRadius: 999, border: "2px solid rgba(255,255,255,0.5)", fontSize: 26 }}>
              {b}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size, fonts: await cardFonts() },
  );
}
