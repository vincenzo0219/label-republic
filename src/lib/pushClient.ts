import { getMyComments, getPushState, getWatchedPosts, getWatchedProducts, setPushState } from "./watchlist";

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** 서버가 푸시를 쓸 수 있으면 VAPID 공개키, 아니면 null */
export async function pushPublicKey(): Promise<string | null> {
  try {
    const d = (await (await fetch("/api/push")).json()) as { enabled: boolean; publicKey: string | null };
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
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission;
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
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
