import type { MetadataRoute } from "next";
import { roomShortName } from "./myRooms";

/** 홈 화면에 추가(PWA) — 아이콘은 scripts/make-icons.ts 로 assets/icon.svg 에서 만든다 */
export function siteManifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "노방장",
    short_name: "노방장",
    description: "같은 취향끼리 일정·정보·수다",
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

/** 방에서 홈 화면에 추가하면 그 방에서 열리는 앱 (방마다 id 가 달라 여러 방을 따로 설치할 수 있다). 아이콘은 같다 */
export function roomManifest(room: { slug: string; name: string }): MetadataRoute.Manifest {
  const path = `/c/${encodeURIComponent(room.slug)}`;
  return {
    ...siteManifest(),
    id: path,
    name: `${room.name} · 노방장`,
    short_name: roomShortName(room),
    start_url: `${path}?source=pwa`,
    shortcuts: [{ name: "글쓰기", url: `/write?category=${encodeURIComponent(room.slug)}`, icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] }],
  };
}
