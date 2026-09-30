// 인라인 스크립트(Next 하이드레이션·JSON-LD) 때문에 script-src 전체 CSP 대신,
// 클릭재킹·MIME 스니핑·외부 임베드 같은 저비용 고효과 헤더만 적용한다.
// next.config.ts 와 읽기 전용 모드 저장본(src/lib/snapshot-http.ts, Next 를 거치지 않음)이 함께 쓴다.
export const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];
