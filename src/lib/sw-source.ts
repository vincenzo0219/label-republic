/**
 * 서비스 워커 소스 (Sprint 19). /sw.js 라우트가 빌드 번호를 넣어 내려준다.
 *
 * 하는 일
 *  1. 오프라인 읽기: 본 글(최근 20개)과 "📥 오프라인 저장"한 글(50개)을 기기에 저장해 두고, 연결이 없으면 그걸 보여준다.
 *     블라인드·임시조치된 글(페이지에 <meta name="lr-offline" content="no-store">)이나 지워진 글은 저장하지 않고,
 *     다시 볼 때·12시간마다 확인해 기기에서도 지운다. 최근 본 글은 7일, 저장한 글은 30일이 지나면 지운다.
 *  2. 느린 망: 글 페이지는 먼저 네트워크를 기다리다 5초가 넘고 저장본이 있으면 저장본을 보여준다.
 *     JS·CSS(파일 이름에 해시가 있는 /_next/static)는 캐시 우선.
 *  3. 푸시 알림 표시 (Sprint 16).
 * 관리자 화면·API 는 저장하지 않는다.
 */
export function serviceWorkerSource(version: string): string {
  return `/* 노방장 서비스 워커 — build ${version} */
const VERSION = ${JSON.stringify(version)};
const PRECACHE = "lr-precache-" + VERSION;
const PAGES = "lr-pages";
const STATIC = "lr-static";
const MEDIA = "lr-media";
const META = "lr-meta";
const INDEX_URL = "/__lr/offline-index";
const OFFLINE_URL = "/offline";
const MAX_RECENT = 20;
const MAX_PINNED = 50;
const MAX_STATIC = 400;
const MAX_MEDIA = 80;
const RECENT_MAX_AGE = 7 * 86400000;
const PINNED_MAX_AGE = 30 * 86400000;
const REVALIDATE_EVERY = 12 * 3600000;
const SLOW_MS = 5000;
const POST_PATH = /^\\/posts\\/\\d{1,18}$/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      // 오프라인 안내 화면과 그 화면의 JS·CSS
      const res = await fetch(OFFLINE_URL, { cache: "no-store" });
      if (res.ok) {
        await cache.put(OFFLINE_URL, res.clone());
        const html = await res.text();
        const assets = [...new Set(html.match(/\\/_next\\/static\\/[^"'\\s)]+/g) || [])].slice(0, 60);
        const stat = await caches.open(STATIC);
        await Promise.all(assets.map((a) => fetch(a).then((r) => r.ok && stat.put(a, r)).catch(() => {})));
      }
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("lr-precache-") && key !== PRECACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  const reply = (v) => event.ports && event.ports[0] && event.ports[0].postMessage(v);
  if (data.type === "skipWaiting") self.skipWaiting();
  else if (data.type === "pin") event.waitUntil(pin(data.url, true).then(reply, (e) => reply({ error: String(e) })));
  else if (data.type === "unpin") event.waitUntil(unpin(data.url).then(reply));
  else if (data.type === "clear") event.waitUntil(clearSaved().then(reply));
});

// ---------------------------------------------------------------------------
// 저장 목록 (lr-meta 캐시에 JSON 하나로) — 쓰는 곳은 서비스 워커뿐
// ---------------------------------------------------------------------------
async function readIndex() {
  const res = await (await caches.open(META)).match(INDEX_URL);
  try {
    return res ? await res.json() : { pages: {}, revalidatedAt: 0 };
  } catch (e) {
    return { pages: {}, revalidatedAt: 0 };
  }
}
async function writeIndex(index) {
  await (await caches.open(META)).put(INDEX_URL, new Response(JSON.stringify(index), { headers: { "Content-Type": "application/json" } }));
}
let lock = Promise.resolve();
function withIndex(fn) {
  const next = lock.then(async () => {
    const index = await readIndex();
    const out = await fn(index);
    await prune(index);
    await writeIndex(index);
    return out;
  });
  lock = next.catch(() => {});
  return next;
}

function titleOf(html) {
  const m = /<title[^>]*>([\\s\\S]*?)<\\/title>/i.exec(html);
  return m ? m[1].replace(/\\s*[|—]\\s*(노방장|라벨공화국).*$/, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").trim().slice(0, 200) : "";
}
const noStore = (html) => /<meta[^>]+name="lr-offline"[^>]+content="no-store"/i.test(html);

/** 네트워크 응답을 보고 저장하거나(글 페이지) 지운다(블라인드·삭제) */
async function remember(url, res, pinned) {
  const path = new URL(url).pathname;
  if (!POST_PATH.test(path)) return;
  if (res.status === 404 || res.status === 410) return forget(path);
  if (!res.ok) return;
  const html = await res.clone().text();
  if (noStore(html)) return forget(path);
  await (await caches.open(PAGES)).put(path, new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
  await withIndex((index) => {
    const prev = index.pages[path] || {};
    index.pages[path] = { title: titleOf(html) || prev.title || path, savedAt: Date.now(), pinned: pinned || !!prev.pinned };
  });
}
async function forget(path) {
  await (await caches.open(PAGES)).delete(path);
  await withIndex((index) => {
    delete index.pages[path];
  });
}
async function pin(url, flag) {
  const path = new URL(url, self.location.origin).pathname;
  if (!POST_PATH.test(path)) return { ok: false };
  const res = await fetch(path, { cache: "no-store", credentials: "same-origin" });
  await remember(self.location.origin + path, res, flag);
  const index = await readIndex();
  return { ok: !!index.pages[path], pinned: !!(index.pages[path] && index.pages[path].pinned) };
}
async function unpin(url) {
  const path = new URL(url, self.location.origin).pathname;
  await withIndex((index) => {
    if (index.pages[path]) index.pages[path].pinned = false;
  });
  return { ok: true };
}
async function clearSaved() {
  await caches.delete(PAGES);
  await caches.delete(MEDIA);
  await withIndex((index) => {
    index.pages = {};
  });
  return { ok: true };
}

/** 오래된 것·넘치는 것 정리 */
async function prune(index) {
  const now = Date.now();
  const pages = await caches.open(PAGES);
  const entries = Object.entries(index.pages);
  const drop = new Set();
  for (const [p, m] of entries) if (now - m.savedAt > (m.pinned ? PINNED_MAX_AGE : RECENT_MAX_AGE)) drop.add(p);
  const recent = entries.filter(([p, m]) => !m.pinned && !drop.has(p)).sort((a, b) => b[1].savedAt - a[1].savedAt);
  recent.slice(MAX_RECENT).forEach(([p]) => drop.add(p));
  const pinnedList = entries.filter(([p, m]) => m.pinned && !drop.has(p)).sort((a, b) => b[1].savedAt - a[1].savedAt);
  pinnedList.slice(MAX_PINNED).forEach(([p]) => drop.add(p));
  for (const p of drop) {
    delete index.pages[p];
    await pages.delete(p);
  }
}
async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(k);
}

/** 저장한 글이 그사이 블라인드·삭제됐는지 12시간마다 확인 */
async function revalidateSaved() {
  const index = await readIndex();
  if (Date.now() - (index.revalidatedAt || 0) < REVALIDATE_EVERY) return;
  await withIndex((i) => {
    i.revalidatedAt = Date.now();
  });
  for (const [path, m] of Object.entries(index.pages)) {
    try {
      const res = await fetch(path, { cache: "no-store", credentials: "same-origin" });
      await remember(self.location.origin + path, res, m.pinned);
    } catch (e) {
      return; // 오프라인이면 다음에
    }
  }
}

// ---------------------------------------------------------------------------
// 요청 처리
// ---------------------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin") || url.pathname === "/sw.js") return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(req, STATIC, MAX_STATIC));
  } else if (url.pathname.startsWith("/media/")) {
    event.respondWith(networkFirstMedia(req));
  } else if (req.mode === "navigate") {
    event.respondWith(navigate(event, req, url));
  }
});

async function cacheFirst(req, name, max) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    await cache.put(req, res.clone());
    trim(name, max);
  }
  return res;
}

/** 사진: 가려지거나 지워지면(404·410) 기기에서도 지우도록 항상 네트워크 먼저 */
async function networkFirstMedia(req) {
  const cache = await caches.open(MEDIA);
  try {
    const res = await fetch(req);
    if (res.ok) {
      await cache.put(req, res.clone());
      trim(MEDIA, MAX_MEDIA);
    } else if (res.status === 404 || res.status === 410 || res.status === 451) {
      await cache.delete(req);
    }
    return res;
  } catch (e) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw e;
  }
}

async function offlineCopy(path) {
  const hit = await (await caches.open(PAGES)).match(path);
  if (!hit) return null;
  // 저장본임을 화면에 표시 (body 에 data-lr-offline)
  const html = (await hit.text()).replace(/<body([^>]*)>/i, '<body$1 data-lr-offline="1">');
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "X-LR-Offline": "1" } });
}

async function navigate(event, req, url) {
  const isPost = POST_PATH.test(url.pathname);
  const network = fetch(req).then(async (res) => {
    if (isPost) event.waitUntil(remember(req.url, res, false).catch(() => {}));
    event.waitUntil(revalidateSaved().catch(() => {}));
    return res;
  });
  if (isPost) {
    // 느린 망: 5초 안에 오지 않고 저장본이 있으면 저장본 (네트워크 응답은 계속 받아 저장본을 갱신)
    const slow = new Promise((resolve) => setTimeout(() => resolve("slow"), SLOW_MS));
    try {
      const first = await Promise.race([network, slow]);
      if (first !== "slow") return first;
      const copy = await offlineCopy(url.pathname);
      if (copy) return copy;
      return await network;
    } catch (e) {
      const copy = await offlineCopy(url.pathname);
      if (copy) return copy;
    }
  } else {
    try {
      return await network;
    } catch (e) {
      /* 아래 오프라인 화면 */
    }
  }
  const off = await (await caches.open(PRECACHE)).match(OFFLINE_URL);
  // 다른 주소에 오프라인 화면을 그대로 내보내면 화면 주소와 내용이 달라 React 가 어긋난다 → /offline 로 보낸다
  if (off && url.pathname !== OFFLINE_URL) return Response.redirect(self.location.origin + OFFLINE_URL + "?from=" + encodeURIComponent(url.pathname), 302);
  return off || new Response("오프라인입니다. 연결되면 다시 시도하세요.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

// ---------------------------------------------------------------------------
// 푸시 알림 (Sprint 16)
// ---------------------------------------------------------------------------
self.addEventListener("push", (event) => {
  let data = { title: "노방장 새 소식", body: "관심 제품·지켜보는 글에 새 소식이 있어요.", url: "/me", tag: "lr-watch" };
  try {
    if (event.data) data = Object.assign(data, event.data.json());
  } catch (e) {}
  // 같은 사이트의 주소만 연다 ("/\\\\evil.com" 같은 우회도 origin 비교로 막는다)
  let target = "/me";
  try {
    const u = new URL(String(data.url), self.location.origin);
    if (u.origin === self.location.origin) target = u.pathname + u.search + u.hash;
  } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title, { body: data.body, tag: data.tag, renotify: true, data: { url: target }, lang: "ko", icon: "/icons/icon-192.png", badge: "/icons/icon-192.png" }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let target = new URL("/me", self.location.origin).href;
  try {
    const u = new URL((event.notification.data && event.notification.data.url) || "/me", self.location.origin);
    if (u.origin === self.location.origin) target = u.href;
  } catch (e) {}
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && "focus" in c) {
          c.navigate(target);
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
`;
}

/**
 * 비상용 서비스 워커: 설치되자마자 이 사이트의 캐시를 모두 지우고 스스로 등록을 해제한다. fetch 처리기가 없어
 * 이 워커가 맡은 화면의 요청도 모두 그대로 네트워크로 간다. (저장한 글도 지워진다 — 서비스 워커 때문에 사이트가 안 열리는 경우에만 쓴다)
 * 화면을 강제로 새로 불러오지 않는다: 빌드 때 만들어 둔 정적 화면(/offline 등)은 다시 등록하므로 무한 새로고침이 될 수 있다.
 */
export function killSwitchSource(): string {
  return `/* 노방장 서비스 워커 — 비상 해제 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith("lr-")) await caches.delete(key);
    await self.registration.unregister();
  })());
});
`;
}
