import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

// HSTS 는 SITE_URL(런타임 값)에 따라 server.ts 에서 붙인다 — headers() 는 빌드 시점에 고정되기 때문

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["pg", "sharp", "web-push"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // 서비스 워커는 바뀌면 바로 반영되도록 캐시하지 않는다
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
      // 홍보 이미지·영상은 공개 파일 — 광고 관리자 등 다른 사이트 화면에서 불러가 업로드할 수 있게 (쿠키 없이 읽기만)
      { source: "/marketing/:path*", headers: [{ key: "Access-Control-Allow-Origin", value: "*" }, { key: "Cross-Origin-Resource-Policy", value: "cross-origin" }] },
    ];
  },
};

export default nextConfig;
