/**
 * 안드로이드 앱(TWA, com.nobangjang.app) 연결 확인 파일 (10/27). 여기 적힌 서명 키 지문의 앱만 주소창 없이 nobangjang.com 을 띄운다.
 * 지문은 공개 정보다: 플레이 콘솔 > 앱 무결성 > 앱 서명 키(SHA-256), 그리고 업로드 키. ANDROID_CERT_SHA256 (쉼표 구분)로도 더할 수 있다.
 */
const PACKAGE = "com.nobangjang.app";
const FINGERPRINTS: string[] = [];

export const dynamic = "force-dynamic";

export function GET() {
  const extra = (process.env.ANDROID_CERT_SHA256 ?? "").split(",").map((s) => s.trim().toUpperCase()).filter((s) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(s));
  const certs = [...new Set([...FINGERPRINTS, ...extra])];
  const body = certs.length
    ? [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: PACKAGE, sha256_cert_fingerprints: certs } }]
    : [];
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json", "cache-control": "public, max-age=300" } });
}
