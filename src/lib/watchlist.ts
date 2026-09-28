/**
 * 관심 제품·지켜보는 글 (Sprint 16) — 관심 보드처럼 브라우저(localStorage)에만 저장한다.
 * 푸시 알림을 켠 경우에만 목록이 바뀔 때 서버의 구독 정보도 함께 갱신한다.
 */
import { EVENT, read, write } from "./interests";

const KEY_PRODUCTS = "lr:watchProducts";
const KEY_POSTS = "lr:watchPosts";
const KEY_PUSH = "lr:push";
export const MAX_PRODUCTS = 30;
export const MAX_POSTS = 50;

function readIds(key: string): string[] {
  try {
    const v = JSON.parse(read(key) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && /^\d{1,18}$/.test(x)) : [];
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: string[], max: number) {
  // 넘치면 오래된 것부터 뺀다
  write(key, JSON.stringify([...new Set(ids)].slice(-max)));
  window.dispatchEvent(new Event(EVENT));
  schedulePushSync();
}

export const getWatchedProducts = () => readIds(KEY_PRODUCTS);
export const getWatchedPosts = () => readIds(KEY_POSTS);

export function toggleWatchProduct(id: string): boolean {
  const cur = getWatchedProducts();
  const on = !cur.includes(id);
  writeIds(KEY_PRODUCTS, on ? [...cur, id] : cur.filter((x) => x !== id), MAX_PRODUCTS);
  return on;
}

export function toggleWatchPost(id: string): boolean {
  const cur = getWatchedPosts();
  const on = !cur.includes(id);
  writeIds(KEY_POSTS, on ? [...cur, id] : cur.filter((x) => x !== id), MAX_POSTS);
  return on;
}

/** 내가 쓴 글·정정 제안·댓글을 단 글은 자동으로 지켜본다 (이미 있으면 그대로) */
export function watchPost(id: string) {
  const cur = getWatchedPosts();
  if (!cur.includes(id)) writeIds(KEY_POSTS, [...cur, id], MAX_POSTS);
}

/** 리포트 응답에 따라 목록 정리: 병합된 제품은 새 번호로, 지워진 글은 빼기 */
export function reconcile(merged: [string, string][], gonePosts: string[]) {
  if (merged.length) {
    const map = new Map(merged);
    writeIds(KEY_PRODUCTS, getWatchedProducts().map((id) => map.get(id) ?? id), MAX_PRODUCTS);
  }
  if (gonePosts.length) writeIds(KEY_POSTS, getWatchedPosts().filter((id) => !gonePosts.includes(id)), MAX_POSTS);
}

// ---------------------------------------------------------------------------
// 푸시 구독 상태 (이 브라우저가 알림을 켰는지 + 구독을 바꿀 수 있는 토큰)
// ---------------------------------------------------------------------------

export type PushState = { endpoint: string; token: string };

export function getPushState(): PushState | null {
  try {
    const v = JSON.parse(read(KEY_PUSH) ?? "null");
    return v && typeof v.endpoint === "string" && typeof v.token === "string" ? v : null;
  } catch {
    return null;
  }
}

export function setPushState(s: PushState | null) {
  write(KEY_PUSH, JSON.stringify(s));
  // 방금 구독하며 목록을 보냈으므로 하루 동안은 다시 맞출 필요가 없다
  if (s) write("lr:pushSyncedAt", String(Date.now()));
  window.dispatchEvent(new Event(EVENT));
}

let syncTimer: ReturnType<typeof setTimeout> | undefined;
function schedulePushSync() {
  if (!getPushState()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => void syncPush(), 800);
}

/** 서버의 구독 목록을 이 브라우저의 목록과 맞춘다. 서버에 구독이 없어졌으면 상태를 지운다 */
export async function syncPush(): Promise<void> {
  const s = getPushState();
  if (!s) return;
  try {
    const res = await fetch("/api/push", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: s.endpoint, token: s.token, products: getWatchedProducts(), posts: getWatchedPosts() }),
    });
    if (res.status === 403 || res.status === 404) setPushState(null);
  } catch {
    // 다음 변경 때 다시 시도
  }
}

/** 헤더에서 페이지마다 호출: 알림을 켠 브라우저면 하루 한 번 서버 목록을 맞춘다 (90일 미사용 자동 삭제의 기준) */
export function dailyPushSync() {
  if (!getPushState()) return;
  const last = Number(read("lr:pushSyncedAt") ?? 0);
  if (Date.now() - last < 86400_000) return;
  write("lr:pushSyncedAt", String(Date.now()));
  void syncPush();
}
