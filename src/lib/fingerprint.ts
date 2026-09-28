import { createHmac } from "node:crypto";
import { config } from "./config";

/** server.ts가 소켓 주소로 덮어쓰는 헤더 — 클라이언트가 위조할 수 없다. */
export const CLIENT_IP_HEADER = "x-labelrep-client-ip";

/**
 * 클라이언트 IP. TRUST_PROXY=true 이면 X-Forwarded-For 를 쓰되, **맨 앞이 아니라 오른쪽에서 TRUST_PROXY_HOPS 번째** 값을 쓴다.
 * 맨 앞 값은 클라이언트가 임의로 넣을 수 있어(예: "X-Forwarded-For: 1.2.3.4") 매 요청 다른 IP로 위장해
 * 중복 투표 방지를 우회할 수 있다. 우리 프록시가 덧붙인 값만 믿는다.
 */
export function clientIpFrom(xff: string | null | undefined, socketIp: string | null | undefined, trustProxy: boolean, hops: number): string {
  if (trustProxy && xff) {
    const chain = xff.split(",").map((s) => s.trim()).filter(Boolean);
    const picked = chain[chain.length - hops];
    if (picked) return picked;
  }
  return socketIp ?? "unknown";
}

export function clientIp(headers: Headers): string {
  return clientIpFrom(headers.get("x-forwarded-for"), headers.get(CLIENT_IP_HEADER), config.trustProxy, config.trustProxyHops);
}

/**
 * 투표/신고 중복 방지용 fingerprint = HMAC(secret, IP | User-Agent).
 * 원본 IP는 저장하지 않는다. 쿠키 기반이 아니므로 쿠키 삭제로 재투표할 수 없다.
 */
export function fingerprint(headers: Headers): string {
  const ua = headers.get("user-agent") ?? "";
  return createHmac("sha256", config.appSecret).update(`${clientIp(headers)}|${ua}`).digest("hex");
}

/** IP 를 같은 망 단위로 묶는다: IPv4 는 /24, IPv6 는 /48 (IPv4-mapped IPv6 는 IPv4 로) */
export function networkPrefix(ip: string): string {
  const v4 = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/i.exec(ip);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;
  if (ip.includes(":")) {
    // :: 를 풀어 앞 3개 그룹(48비트)만
    const [head, tail = ""] = ip.toLowerCase().split("::");
    const h = head ? head.split(":") : [];
    const t = tail ? tail.split(":") : [];
    const full = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
    return `${full.slice(0, 3).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/48`;
  }
  return ip;
}

/**
 * 규칙 투표 조작 탐지용 망 식별값 (Sprint 23) = HMAC(secret, 망 대역) 앞 16자.
 * 같은 대역(집·회사·같은 통신사 구간)에서 온 표를 묶어 볼 수 있을 뿐, IP 로 되돌릴 수 없다.
 */
export function networkHash(headers: Headers): string {
  return createHmac("sha256", config.appSecret).update(`net:${networkPrefix(clientIp(headers))}`).digest("hex").slice(0, 16);
}
