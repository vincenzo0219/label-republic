import type { MetadataRoute } from "next";

/** 홈 화면에 추가(PWA) — 아이콘은 scripts/make-icons.ts 로 assets/icon.svg 에서 만든다 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "노방장",
    short_name: "노방장",
    description: "방장 없는 덕후 커뮤니티",
    lang: "ko",
    dir: "ltr",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f5f1",
    theme_color: "#1f5f4a",
    categories: ["social", "health", "shopping"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "글쓰기", url: "/write", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "내 리포트", url: "/me", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "저장한 글 (오프라인)", short_name: "저장한 글", url: "/offline", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
