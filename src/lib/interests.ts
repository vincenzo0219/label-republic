/**
 * 관심 보드 · 마지막 리포트 확인 시각 — 브라우저(localStorage)에만 저장한다. 서버로 저장·전송하지 않고,
 * 리포트 요청 때만 쿼리 파라미터로 보낸다 (서버는 기록하지 않음).
 */
const KEY_BOARDS = "lr:interests";
const KEY_SEEN = "lr:reportSeenAt";
export const EVENT = "lr:interests-changed";

export function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {}
}

export function getInterests(): string[] {
  try {
    const v = JSON.parse(read(KEY_BOARDS) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 10) : [];
  } catch {
    return [];
  }
}

export function setInterests(slugs: string[]) {
  write(KEY_BOARDS, JSON.stringify(Array.from(new Set(slugs)).slice(0, 10)));
  window.dispatchEvent(new Event(EVENT));
}

export function toggleInterest(slug: string): boolean {
  const cur = getInterests();
  const on = !cur.includes(slug);
  setInterests(on ? [...cur, slug] : cur.filter((s) => s !== slug));
  return on;
}

export function getSeenAt(): string | null {
  return read(KEY_SEEN);
}

export function setSeenAt(iso: string) {
  write(KEY_SEEN, iso);
  window.dispatchEvent(new Event(EVENT));
}

export function onInterestsChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}
