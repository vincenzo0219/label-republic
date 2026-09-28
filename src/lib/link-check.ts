/**
 * 출처 링크 생존 확인 (서버 전용).
 *
 * 서버가 사용자가 넣은 주소로 직접 요청을 보내므로 SSRF(내부망 접근)를 막는 것이 핵심이다.
 * - http·https, 기본 포트만
 * - DNS 결과를 검사한 주소로만 접속 (lookup 훅) — DNS 재바인딩으로 검사를 우회할 수 없다
 * - IP 리터럴 호스트도 같은 기준으로 검사, 리다이렉트는 매 단계 다시 검사 (최대 3번)
 * - 응답 본문은 제목을 찾기 위해 최대 64KB만 읽는다
 */
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

const blocked = new net.BlockList();
for (const [addr, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(addr, prefix, "ipv4");
for (const [addr, prefix] of [
  ["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["2001:db8::", 32], ["64:ff9b::", 96], ["100::", 64],
] as const) blocked.addSubnet(addr, prefix, "ipv6");

/** 공인 주소인가 (사설·루프백·링크 로컬·CGNAT·멀티캐스트·문서용 대역이 아닌가) */
export function isPublicAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return !blocked.check(ip, "ipv4");
  if (family === 6) {
    // IPv4-mapped (::ffff:10.0.0.1) 은 안의 IPv4 로 판단
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (mapped) return isPublicAddress(mapped[1]!);
    return !blocked.check(ip, "ipv6");
  }
  return false;
}

export type LinkOutcome = "ok" | "gone" | "inconclusive" | "blocked";
export type LinkCheckResult = { outcome: LinkOutcome; httpStatus?: number; title?: string; finalUrl?: string; error?: string };

export type LinkCheckOptions = {
  timeoutMs?: number;
  maxRedirects?: number;
  /** 테스트에서 로컬 서버를 허용하기 위한 훅 (기본: 공인 주소만) */
  allowAddress?: (ip: string) => boolean;
  /** 테스트 전용: 80·443 이외 포트 허용 */
  allowAnyPort?: boolean;
  userAgent?: string;
};

const MAX_BODY = 64 * 1024;

function decodeEntities(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** HTML 앞부분에서 <title> 추출 (charset 은 헤더 → meta 순) */
export function extractTitle(buf: Buffer, contentType = ""): string | undefined {
  const head = buf.subarray(0, MAX_BODY).toString("latin1");
  let charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1] ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ?? "utf-8";
  charset = charset.toLowerCase();
  let text: string;
  try {
    text = new TextDecoder(charset === "ks_c_5601-1987" ? "euc-kr" : charset).decode(buf);
  } catch {
    text = buf.toString("utf8");
  }
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(text);
  if (!m) return undefined;
  const title = decodeEntities(m[1]!).replace(/\s+/g, " ").trim().slice(0, 200);
  return title || undefined;
}

function requestOnce(url: URL, opts: Required<Pick<LinkCheckOptions, "timeoutMs" | "allowAddress" | "userAgent">>): Promise<{ status: number; location?: string; body: Buffer; contentType: string }> {
  return new Promise((resolve, reject) => {
    const lookup: net.LookupFunction = (hostname, options, cb) => {
      dns.lookup(hostname, { all: true }, (err, addrs) => {
        if (err) return (cb as (e: Error) => void)(err);
        if (!addrs.length || addrs.some((a) => !opts.allowAddress(a.address))) {
          return (cb as (e: Error) => void)(Object.assign(new Error(`blocked address for ${hostname}`), { code: "EBLOCKED" }));
        }
        if ((options as dns.LookupOptions).all) return (cb as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, addrs);
        return cb(null, addrs[0]!.address, addrs[0]!.family);
      });
    };
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(url, {
      method: "GET",
      lookup,
      timeout: opts.timeoutMs,
      headers: { "user-agent": opts.userAgent, accept: "text/html,application/xhtml+xml,*/*;q=0.8", "accept-language": "ko,en;q=0.8" },
    });
    const timer = setTimeout(() => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })), opts.timeoutMs);
    req.on("timeout", () => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
    req.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    req.on("response", (res) => {
      const status = res.statusCode ?? 0;
      const contentType = String(res.headers["content-type"] ?? "");
      const location = res.headers.location;
      const chunks: Buffer[] = [];
      let size = 0;
      const done = () => {
        clearTimeout(timer);
        res.destroy();
        resolve({ status, location, body: Buffer.concat(chunks), contentType });
      };
      // 제목은 HTML 에만 있으므로 그 외에는 본문을 읽지 않는다
      if (status < 200 || status >= 300 || !/html/i.test(contentType)) return done();
      res.on("data", (c: Buffer) => {
        chunks.push(c);
        size += c.length;
        if (size >= MAX_BODY) done();
      });
      res.on("end", done);
      res.on("error", done);
    });
    req.end();
  });
}

export async function checkLink(raw: string, options: LinkCheckOptions = {}): Promise<LinkCheckResult> {
  const opts = {
    timeoutMs: options.timeoutMs ?? 8000,
    allowAddress: options.allowAddress ?? isPublicAddress,
    userAgent: options.userAgent ?? "LabelRepublicLinkCheck/1.0 (+source link liveness check)",
  };
  const maxRedirects = options.maxRedirects ?? 3;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { outcome: "gone", error: "invalid url" };
  }
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (url.protocol !== "http:" && url.protocol !== "https:") return { outcome: "blocked", error: `protocol ${url.protocol}` };
    if (url.port && !["80", "443"].includes(url.port) && !options.allowAnyPort) return { outcome: "blocked", error: `port ${url.port}` };
    if (url.username || url.password) return { outcome: "blocked", error: "credentials in url" };
    const host = url.hostname.replace(/^\[|\]$/g, "");
    // IP 리터럴은 DNS 조회(lookup 훅)를 거치지 않으므로 여기서 검사
    if (net.isIP(host) && !opts.allowAddress(host)) return { outcome: "blocked", error: `address ${host}` };
    let res;
    try {
      res = await requestOnce(url, opts);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? "";
      if (code === "EBLOCKED") return { outcome: "blocked", error: (err as Error).message };
      // 도메인이 아예 없으면 확정 실패, 일시적인 DNS·연결·시간 초과는 판단 보류
      if (code === "ENOTFOUND") return { outcome: "gone", error: code };
      return { outcome: "inconclusive", error: code || (err as Error).message };
    }
    if (res.status >= 300 && res.status < 400 && res.location) {
      try {
        url = new URL(res.location, url);
      } catch {
        return { outcome: "inconclusive", httpStatus: res.status, error: "bad redirect" };
      }
      continue;
    }
    if (res.status >= 200 && res.status < 300) {
      return { outcome: "ok", httpStatus: res.status, title: extractTitle(res.body, res.contentType), finalUrl: url.toString() };
    }
    if (res.status === 404 || res.status === 410) return { outcome: "gone", httpStatus: res.status };
    // 401·403·429·5xx: 봇 차단이거나 일시 장애일 수 있어 깨졌다고 단정하지 않는다
    return { outcome: "inconclusive", httpStatus: res.status };
  }
  return { outcome: "inconclusive", error: "too many redirects" };
}
