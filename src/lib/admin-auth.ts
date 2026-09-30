import { createHash, timingSafeEqual } from "node:crypto";

/**
 * 운영 대시보드(/admin) HTTP Basic 인증. 사용자명은 무시하고 비밀번호만 비교한다.
 * 비밀번호가 설정되지 않았으면 대시보드는 존재하지 않는 것처럼 404 로 응답한다.
 */
export type AdminAuthResult = "disabled" | "ok" | "unauthorized";

export function checkAdminAuth(authorization: string | undefined, password: string | undefined): AdminAuthResult {
  if (!password) return "disabled";
  const m = authorization?.match(/^Basic\s+([A-Za-z0-9+/=]+)$/i);
  if (!m) return "unauthorized";
  const decoded = Buffer.from(m[1]!, "base64").toString("utf8");
  const colon = decoded.indexOf(":");
  if (colon < 0) return "unauthorized";
  const given = decoded.slice(colon + 1);
  // 길이 차이로 인한 타이밍 누출을 막기 위해 해시끼리 비교
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(password).digest();
  return timingSafeEqual(a, b) ? "ok" : "unauthorized";
}

/**
 * 퍼센트 인코딩(/%61dmin), 중복 슬래시(//admin), 대소문자 변형까지 정규화한 뒤 판정한다.
 * 라우터가 디코딩해서 매칭하는 경로를 인증 없이 통과시키지 않기 위함.
 */
export function isAdminPath(rawPathname: string): boolean {
  let p = rawPathname;
  try {
    p = decodeURIComponent(rawPathname);
  } catch {
    return true; // 디코딩 불가한 경로는 보수적으로 막는다
  }
  p = p.replace(/\\/g, "/").replace(/\/{2,}/g, "/").toLowerCase();
  return p === "/admin" || p.startsWith("/admin/") || p === "/api/admin" || p.startsWith("/api/admin/");
}
