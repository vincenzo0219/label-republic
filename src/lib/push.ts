/**
 * 웹 푸시 발송 (서버 전용). 브라우저가 준 푸시 서비스 주소로 서버가 요청을 보내므로,
 * 알려진 푸시 서비스(https)로만 보낸다 — 임의 주소를 넣어 서버가 내부망으로 요청하게 만들 수 없다.
 */
import webpush from "web-push";
import { config } from "./config";

const KNOWN_PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome·Edge(구)·Android
  /^(updates\.)?push\.services\.mozilla\.com$/, // Firefox
  /^[a-z0-9-]+\.notify\.windows\.com$/, // Edge (Windows)
  /^web\.push\.apple\.com$/, // Safari
  /^[a-z0-9-]+\.push\.apple\.com$/,
];

export function isAllowedEndpoint(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  if (config.pushExtraHosts.includes(host)) return u.protocol === "https:";
  return u.protocol === "https:" && !u.port && KNOWN_PUSH_HOSTS.some((re) => re.test(host));
}

export type PushTarget = { endpoint: string; p256dh: string; auth: string };
export type PushMessage = { title: string; body: string; url: string; tag: string };
export type SendResult = "sent" | "gone" | "failed";

let configured = false;
function setup() {
  if (configured) return;
  webpush.setVapidDetails(`mailto:${config.contactEmail}`, config.vapidPublicKey, config.vapidPrivateKey);
  configured = true;
}

/** agent: 테스트에서 자체 서명 인증서 서버로 보낼 때만 */
export async function sendPush(target: PushTarget, msg: PushMessage, agent?: import("node:https").Agent): Promise<SendResult> {
  if (!isAllowedEndpoint(target.endpoint)) return "gone";
  setup();
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(msg),
      { TTL: 12 * 3600, urgency: "normal", timeout: 10_000, topic: msg.tag, ...(agent ? { agent } : {}) },
    );
    return "sent";
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    // 404·410: 구독이 없어짐(브라우저에서 알림 해제 등) → 삭제
    if (status === 404 || status === 410) return "gone";
    return "failed";
  }
}
