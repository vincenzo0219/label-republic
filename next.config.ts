import type { NextConfig } from "next";

// 인라인 스크립트(Next 하이드레이션·JSON-LD) 때문에 script-src 전체 CSP 대신,
// 클릭재킹·MIME 스니핑·외부 임베드 같은 저비용 고효과 헤더만 적용한다.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];
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
    ];
  },
};

export default nextConfig;
