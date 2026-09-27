/**
 * 단일 인스턴스용 인메모리 슬라이딩 윈도우 제한기.
 * 4자리 비밀번호(1만 가지) 무차별 대입과 LLM 요약 남용을 막는 최소 방어선이다.
 * 다중 인스턴스 배포 시 Redis 등 공유 저장소로 교체해야 한다.
 */
const g = globalThis as unknown as { __labelRepBuckets?: Map<string, number[]> };
const buckets: Map<string, number[]> = (g.__labelRepBuckets ??= new Map());

export function hit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  return true;
}

export function isLimited(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  return (buckets.get(key) ?? []).filter((t) => now - t < windowMs).length >= limit;
}

export function resetRateLimits() {
  buckets.clear();
}
