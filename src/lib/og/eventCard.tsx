import { ImageResponse } from "next/og";
import { cardFonts } from "./fonts";

const C = { bg: "#f6f5f1", surface: "#ffffff", text: "#1c1b19", muted: "#6b6760", brand: "#1f5f4a", line: "#e4e1da", dday: "#b42318", ddayBg: "#fde8e7" };

export type EventCardData = { id: string; room: string; name: string; when: string | null; dday: string | null; going: string | null };

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** 🙋 행사 글 카톡 공유 카드 (10/26, 1200×630): 행사명 · 날짜 · D-day · "같이 갈 사람 N명"(3명부터) */
export async function renderEventCard(e: EventCardData, siteHost: string): Promise<ImageResponse> {
  const width = 1200;
  const height = 630;
  return new ImageResponse(
    (
      <div style={{ width, height, display: "flex", flexDirection: "column", background: C.bg, padding: 64, fontFamily: "Pretendard", color: C.text, wordBreak: "keep-all" }}>
        <div style={{ display: "flex", gap: 12, fontSize: 26, alignItems: "center" }}>
          <div style={{ display: "flex", padding: "6px 18px", borderRadius: 999, border: `2px solid ${C.line}`, color: C.muted, fontWeight: 700 }}>{e.room}</div>
          <div style={{ display: "flex", padding: "6px 18px", borderRadius: 999, background: "#e3efe9", color: C.brand, fontWeight: 700 }}>행사</div>
          {e.dday && <div style={{ display: "flex", padding: "6px 18px", borderRadius: 999, background: C.ddayBg, color: C.dday, fontWeight: 700 }}>{e.dday}</div>}
        </div>
        <div style={{ display: "flex", fontSize: 68, fontWeight: 700, lineHeight: 1.2, marginTop: 40, letterSpacing: -1 }}>{clip(e.name, 30)}</div>
        {e.when && <div style={{ display: "flex", fontSize: 40, color: C.muted, marginTop: 20 }}>{e.when}</div>}
        <div style={{ display: "flex", flexGrow: 1 }} />
        {e.going && (
          <div style={{ display: "flex", alignSelf: "flex-start", padding: "16px 28px", borderRadius: 20, background: C.surface, border: `2px solid ${C.line}`, fontSize: 36, fontWeight: 700, color: C.brand }}>
            {e.going}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 28, fontSize: 24, color: C.muted }}>
          <span style={{ fontWeight: 700, color: C.text, fontSize: 30 }}>노방장</span>
          <div style={{ display: "flex" }}>{`${siteHost}/posts/${e.id}`}</div>
        </div>
      </div>
    ),
    { width, height, fonts: await cardFonts(), headers: { "Cache-Control": "public, max-age=300, s-maxage=1800" } },
  );
}
