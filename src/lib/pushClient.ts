import { toast } from "./toast";
import { getMyComments, getPushState, getWatchedPosts, getWatchedProducts, setPushState } from "./watchlist";

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// ---------------------------------------------------------------------------
// iOS 앱 (nobangjang-ios, 10/27): 앱 화면(WKWebView)에는 웹 푸시가 없어서, 앱이 넣어 주는 window.nobangjangNative 로
// 애플 알림(APNs) 권한·기기 토큰을 받고, 서버에는 "apns://<토큰>" 주소로 웹 푸시와 같은 방식으로 등록한다.
// ---------------------------------------------------------------------------
type NativeBridge = {
  enablePush(): Promise<{ granted: boolean; permission: string; token: string | null }>;
  disablePush(): Promise<unknown>;
  pushStatus(): Promise<{ permission: string; token: string | null }>;
};

/** 앱 안에서 열렸는지 (앱이 User-Agent 끝에 붙임, 브리지가 늦게 들어와도 바로 안다) */
export function isIosApp(): boolean {
  try {
    return typeof window !== "undefined" && (/nobangjang-ios\//.test(navigator.userAgent) || "nobangjangNative" in window);
  } catch {
    return false;
  }
}

/** 앱 브리지는 페이지가 다 읽힌 뒤 들어오므로 잠깐 기다린다 */
export function nativeBridge(timeoutMs = 4000): Promise<NativeBridge | null> {
  const get = () => (window as unknown as { nobangjangNative?: NativeBridge }).nobangjangNative ?? null;
  if (!isIosApp()) return Promise.resolve(null);
  const now = get();
  if (now) return Promise.resolve(now);
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(get()), timeoutMs);
    window.addEventListener("nobangjangnative:ready", () => (clearTimeout(t), resolve(get())), { once: true });
  });
}

/** 알림 권한이 있는지. 앱에서는 이 기기 토큰으로 등록돼 있으면 켜진 것으로 본다 (권한은 iOS 설정에서만 바뀜) */
export function pushGranted(): boolean {
  try {
    if (isIosApp()) return !!getPushState()?.endpoint.startsWith("apns://");
    return Notification.permission === "granted";
  } catch {
    return false;
  }
}

export function pushDenied(): boolean {
  try {
    return !isIosApp() && Notification.permission === "denied";
  } catch {
    return false;
  }
}

export function pushSupported(): boolean {
  if (isIosApp()) return true;
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** 서버가 푸시를 쓸 수 있으면 VAPID 공개키, 아니면 null. iOS 앱에서는 서버에 앱 알림(APNs) 키가 있어야 쓸 수 있다 */
export async function pushPublicKey(): Promise<string | null> {
  try {
    const d = (await (await fetch("/api/push")).json()) as { enabled: boolean; publicKey: string | null; apns?: boolean };
    if (isIosApp() && !d.apns) return null;
    return d.enabled ? d.publicKey : null;
  } catch {
    return null;
  }
}

/**
 * 이 브라우저의 푸시를 켜고 관심 목록과 함께 서버에 등록한다. daily 를 주면 오늘의 문제 알림도 그 값으로 (빼면 그대로).
 * 권한을 거절하면 "denied"/"default" 를 돌려준다.
 */
export async function enablePush(publicKey: string, daily?: boolean): Promise<"on" | NotificationPermission> {
  const json = isIosApp() ? await nativeSubscription() : await webSubscription(publicKey);
  if (typeof json === "string") return json;
  const prev = getPushState();
  const res = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription: { endpoint: json.endpoint, keys: json.keys },
      products: getWatchedProducts(),
      posts: getWatchedPosts(),
      comments: getMyComments(),
      ...(prev?.endpoint === json.endpoint ? { token: prev.token } : {}),
      ...(daily !== undefined ? { daily } : {}),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "알림을 켜지 못했어요.");
  setPushState({ endpoint: json.endpoint, token: data.token });
  return "on";
}

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };

async function webSubscription(publicKey: string): Promise<Sub | NotificationPermission> {
  const permission = await Notification.requestPermission();
  // 거절돼 있으면 버튼이 아무 반응 없어 보이므로 한 줄 알려 준다 (10/24)
  if (permission === "denied") toast("알림이 꺼져 있어요 · 브라우저 설정에서 켜 주세요", 2500);
  if (permission !== "granted") return permission;
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
  return sub.toJSON() as Sub;
}

/** 앱: iOS 권한 창 → 기기 토큰. 키 자리는 서버의 APNS_KEYS 와 같은 값 */
async function nativeSubscription(): Promise<Sub | NotificationPermission> {
  const native = await nativeBridge();
  if (!native) {
    toast("앱을 다시 열어 주세요", 2500);
    return "default";
  }
  const r = await native.enablePush();
  if (!r.granted || !r.token) {
    if (r.permission === "denied") toast("알림이 꺼져 있어요 · 아이폰 설정 > 노방장 > 알림에서 켜 주세요", 3000);
    return r.permission === "denied" ? "denied" : "default";
  }
  return { endpoint: `apns://${r.token.toLowerCase()}`, keys: { p256dh: "apns-ios-device", auth: "apns-ios" } };
}
