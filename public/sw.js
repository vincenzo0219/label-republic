/*
 * 라벨공화국 서비스 워커 — 푸시 알림 표시만 한다 (페이지 캐시는 하지 않음).
 * 알림 내용은 서버가 암호화해 보낸 { title, body, url, tag }.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = { title: "라벨공화국 새 소식", body: "관심 제품·지켜보는 글에 새 소식이 있어요.", url: "/me", tag: "lr-watch" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {}
  // 같은 사이트의 경로만 연다
  const url = typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//") ? data.url : "/me";
  event.waitUntil(
    self.registration.showNotification(data.title, { body: data.body, tag: data.tag, renotify: true, data: { url }, lang: "ko" }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/me", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && "focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
