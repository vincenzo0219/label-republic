import { createHmac } from "node:crypto";
import { config } from "./config";

/** server.ts가 소켓 주소로 덮어쓰는 헤더 — 클라이언트가 위조할 수 없다. */
export const CLIENT_IP_HEADER = "x-labelrep-client-ip";

export function clientIp(headers: Headers): string {
  if (config.trustProxy) {
    const xff = headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim();
  }
  return headers.get(CLIENT_IP_HEADER) ?? "unknown";
}

/**
 * 투표/신고 중복 방지용 fingerprint = HMAC(secret, IP | User-Agent).
 * 원본 IP는 저장하지 않는다. 쿠키 기반이 아니므로 쿠키 삭제로 재투표할 수 없다.
 */
export function fingerprint(headers: Headers): string {
  const ua = headers.get("user-agent") ?? "";
  return createHmac("sha256", config.appSecret).update(`${clientIp(headers)}|${ua}`).digest("hex");
}
