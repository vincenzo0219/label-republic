/**
 * 오프라인 저장 (Sprint 19, 브라우저 전용) — 서비스 워커가 쓰는 저장 목록을 읽고, 저장·해제를 요청한다.
 */
export type SavedPage = { path: string; title: string; savedAt: number; pinned: boolean };

const INDEX_URL = "/__lr/offline-index";

export function offlineSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "caches" in window;
}

export async function savedPages(): Promise<SavedPage[]> {
  if (!offlineSupported()) return [];
  try {
    const res = await (await caches.open("lr-meta")).match(INDEX_URL);
    if (!res) return [];
    const index = (await res.json()) as { pages: Record<string, Omit<SavedPage, "path">> };
    return Object.entries(index.pages)
      .map(([path, m]) => ({ path, ...m }))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

/** 서비스 워커에 요청하고 답을 기다린다 */
export async function askWorker<T = { ok: boolean }>(msg: Record<string, unknown>, timeoutMs = 15000): Promise<T> {
  const reg = await navigator.serviceWorker.ready;
  const worker = reg.active;
  if (!worker) throw new Error("서비스 워커가 아직 준비되지 않았어요.");
  return new Promise<T>((resolve, reject) => {
    const ch = new MessageChannel();
    const t = setTimeout(() => reject(new Error("응답이 없어요. 잠시 후 다시 시도하세요.")), timeoutMs);
    ch.port1.onmessage = (e) => {
      clearTimeout(t);
      resolve(e.data as T);
    };
    worker.postMessage(msg, [ch.port2]);
  });
}
