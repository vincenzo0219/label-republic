/**
 * iOS 앱 푸시 (APNs, 10/27). 앱(nobangjang-ios)이 준 기기 토큰을 웹 푸시 구독과 같은 표(push_subscriptions)에
 * "apns://<토큰>" 주소로 저장하고, 보낼 때 sendPush 가 이쪽으로 넘긴다. 그래서 내 방 새 글·행사·답글 알림이 앱에도 그대로 간다.
 * 인증은 팀의 APNs 키(.p8)로 만든 ES256 토큰 (애플 권장: 20~60분마다 새로).
 */
import { createPrivateKey, sign } from "node:crypto";
import http2 from "node:http2";
import { config } from "./config";
import type { PushMessage, SendResult } from "./push";

export const APNS_PREFIX = "apns://";
const TOKEN_RE = /^[0-9a-f]{64,200}$/;
/** 웹 푸시용 암호화 키 자리에 넣는 값 (APNs 는 쓰지 않음). 같은 기기가 다시 등록할 때 이 값이 같아야 덮어쓴다 */
export const APNS_KEYS = { p256dh: "apns-ios-device", auth: "apns-ios" } as const;

export function isApnsToken(t: string): boolean {
  return TOKEN_RE.test(t);
}

export function apnsEndpoint(token: string): string {
  return `${APNS_PREFIX}${token}`;
}

/** "apns://<hex>" → 토큰, 아니면 null */
export function apnsTokenOf(endpoint: string): string | null {
  if (!endpoint.startsWith(APNS_PREFIX)) return null;
  const t = endpoint.slice(APNS_PREFIX.length);
  return isApnsToken(t) ? t : null;
}

let jwtCache: { value: string; at: number; key: string } | null = null;

/** 공급자 인증 토큰. 같은 키로 40분 동안 다시 쓴다 */
export function providerToken(nowMs = Date.now()): string {
  const cacheKey = `${config.apnsTeamId}|${config.apnsKeyId}`;
  if (jwtCache && jwtCache.key === cacheKey && nowMs - jwtCache.at < 40 * 60_000) return jwtCache.value;
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const iat = Math.floor(nowMs / 1000);
  const head = `${b64({ alg: "ES256", kid: config.apnsKeyId })}.${b64({ iss: config.apnsTeamId, iat })}`;
  const sig = sign("sha256", Buffer.from(head), { key: createPrivateKey(config.apnsPrivateKey), dsaEncoding: "ieee-p1363" });
  const value = `${head}.${sig.toString("base64url")}`;
  jwtCache = { value, at: nowMs, key: cacheKey };
  return value;
}

export function apnsPayload(msg: PushMessage) {
  return { aps: { alert: { title: msg.title, body: msg.body }, sound: "default", "thread-id": msg.tag }, url: msg.url };
}

/** 이 응답이면 토큰이 더는 쓸 수 없다 → 구독 삭제 */
const GONE_REASONS = new Set(["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"]);

/** ca: 테스트에서 자체 서명 인증서 서버로 보낼 때만 */
export async function sendApns(token: string, msg: PushMessage, opts: { ca?: Buffer } = {}): Promise<SendResult> {
  if (!isApnsToken(token)) return "gone";
  if (!config.apnsEnabled) return "failed";
  let auth: string;
  try {
    auth = providerToken();
  } catch {
    return "failed"; // 키 형식이 잘못됨 (운영 설정 문제) — 구독은 지우지 않는다
  }
  const body = JSON.stringify(apnsPayload(msg));
  const first = await post(config.apnsOrigin, token, auth, body, msg.tag, opts.ca);
  // 개발용(Xcode) 빌드 토큰은 운영 APNs 가 BadDeviceToken 으로 돌려보낸다 → 개발용 APNs 로 한 번 더
  const r = first.status === 400 && first.reason === "BadDeviceToken" ? await post(config.apnsSandboxOrigin, token, auth, body, msg.tag, opts.ca) : first;
  if (r.status === 200) return "sent";
  if (r.status === 410) return "gone";
  return r.status === 400 && GONE_REASONS.has(r.reason) ? "gone" : "failed";
}

function post(origin: string, token: string, auth: string, body: string, tag: string, ca?: Buffer): Promise<{ status: number; reason: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (status: number, reason = "") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      session.close();
      resolve({ status, reason });
    };
    const session = http2.connect(origin, ca ? { ca } : {});
    const timer = setTimeout(() => {
      session.destroy();
      done(0);
    }, 10_000);
    session.on("error", () => done(0));
    const req = session.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${auth}`,
      "apns-topic": config.apnsBundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(Math.floor(Date.now() / 1000) + 12 * 3600),
      "apns-collapse-id": tag.slice(0, 64),
      "content-type": "application/json",
    });
    let status = 0;
    let text = "";
    req.setEncoding("utf8");
    req.on("response", (h) => (status = Number(h[":status"] ?? 0)));
    req.on("data", (c: string) => (text += c));
    req.on("error", () => done(0));
    req.on("end", () => {
      let reason = "";
      try {
        reason = String((JSON.parse(text) as { reason?: string }).reason ?? "");
      } catch {}
      done(status, reason);
    });
    req.end(body);
  });
}
