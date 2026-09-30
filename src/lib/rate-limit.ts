/**
 * 레이트 리밋 — 4자리 비밀번호 무차별 대입, 도배, LLM 요약 남용을 막는 방어선.
 *
 * 백엔드 (RATE_LIMIT_BACKEND):
 * - postgres (운영 기본): 모든 인스턴스가 같은 한도를 공유. 현재·직전 고정 창을 가중 합산하는 근사 슬라이딩 윈도우.
 * - memory (개발·테스트 기본): 프로세스 내 정확한 슬라이딩 윈도우. 인스턴스가 하나일 때만 올바르다.
 */
import { config } from "./config";
import { query } from "./db";

// ---------------------------------------------------------------------------
// memory
// ---------------------------------------------------------------------------
const g = globalThis as unknown as { __labelRepBuckets?: Map<string, number[]> };
const buckets: Map<string, number[]> = (g.__labelRepBuckets ??= new Map());

function memHit(key: string, limit: number, windowMs: number, now: number): boolean {
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  return true;
}

function memCount(key: string, windowMs: number, now: number): number {
  return (buckets.get(key) ?? []).filter((t) => now - t < windowMs).length;
}

// ---------------------------------------------------------------------------
// postgres
// ---------------------------------------------------------------------------

/** 현재 창 카운트 + 직전 창 카운트 × (직전 창이 아직 슬라이딩 윈도우에 걸친 비율) */
async function pgEstimate(key: string, windowMs: number, now: number): Promise<number> {
  const bucket = Math.floor(now / windowMs);
  const rows = await query<{ bucket: string; count: number }>(
    "SELECT bucket, count FROM rate_limits WHERE key = $1 AND bucket IN ($2, $3)",
    [key, bucket, bucket - 1],
  );
  const cur = rows.find((r) => Number(r.bucket) === bucket)?.count ?? 0;
  const prev = rows.find((r) => Number(r.bucket) === bucket - 1)?.count ?? 0;
  const elapsed = (now % windowMs) / windowMs;
  // 올림: 창 경계 직후 3.9993 같은 값이 한도 4를 빠져나가 버스트를 허용하지 않도록 보수적으로 센다
  return Math.ceil(cur + prev * (1 - elapsed));
}

async function pgHit(key: string, limit: number, windowMs: number, now: number): Promise<boolean> {
  if ((await pgEstimate(key, windowMs, now)) >= limit) return false;
  const bucket = Math.floor(now / windowMs);
  await query(
    `INSERT INTO rate_limits (key, bucket, count, expires_at) VALUES ($1, $2, 1, $3)
     ON CONFLICT (key, bucket) DO UPDATE SET count = rate_limits.count + 1`,
    [key, bucket, new Date((bucket + 2) * windowMs).toISOString()],
  );
  return true;
}

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------

function backend(): "memory" | "postgres" {
  return config.rateLimitBackend;
}

/** 요청 1회를 기록하고, 한도 안이면 true. 한도를 넘었으면 기록하지 않고 false. */
export async function hit(key: string, limit: number, windowMs: number, now = Date.now()): Promise<boolean> {
  const k = key.slice(0, 200);
  return backend() === "postgres" ? pgHit(k, limit, windowMs, now) : memHit(k, limit, windowMs, now);
}

/** 기록 없이 현재 한도 초과 여부만 확인 */
export async function isLimited(key: string, limit: number, windowMs: number, now = Date.now()): Promise<boolean> {
  const k = key.slice(0, 200);
  const n = backend() === "postgres" ? await pgEstimate(k, windowMs, now) : memCount(k, windowMs, now);
  return n >= limit;
}

/** 만료된 버킷 정리 (유지보수 배치) */
export async function pruneRateLimits(): Promise<number> {
  const rows = await query<{ n: number }>("WITH d AS (DELETE FROM rate_limits WHERE expires_at < now() RETURNING 1) SELECT count(*)::int AS n FROM d");
  return rows[0]!.n;
}

export async function resetRateLimits(): Promise<void> {
  buckets.clear();
  // 라벨 읽기 하루 한도(src/lib/repo/label-reads.ts reserveLabelRead)는 백엔드와 상관없이 DB 에 센다
  await query("TRUNCATE rate_limits");
}
