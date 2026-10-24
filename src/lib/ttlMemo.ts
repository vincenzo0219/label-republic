/**
 * 공개 데이터의 짧은 메모리 캐시 (10/24 속도) — 방 화면마다 같은 무거운 조회를 다시 하지 않게.
 * 키마다 마지막 결과를 ttlMs 동안 재사용한다. 실패한 결과는 담지 않는다. 같은 키로 동시에 오면 한 번만 조회한다.
 */
export function ttlMemo<A extends string | number, T>(fn: (key: A) => Promise<T>, ttlMs: number): (key: A) => Promise<T> {
  const store = new Map<A, { at: number; value: Promise<T> }>();
  return (key: A) => {
    const now = Date.now();
    const hit = store.get(key);
    if (hit && now - hit.at < ttlMs) return hit.value;
    const value = fn(key);
    store.set(key, { at: now, value });
    value.catch(() => {
      if (store.get(key)?.value === value) store.delete(key);
    });
    if (store.size > 500) store.delete(store.keys().next().value as A);
    return value;
  };
}
