import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "라벨공화국",
    short_name: "라벨공화국",
    description: "방장 없는 성분·취미 팩트체크 커뮤니티",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f5f1",
    theme_color: "#1f5f4a",
    lang: "ko",
  };
}
