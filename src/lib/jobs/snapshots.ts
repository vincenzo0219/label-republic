/**
 * 읽기 전용 모드 저장본 수집 (Sprint 27).
 *
 * 0번 워커가 SNAPSHOT_INTERVAL_SEC 마다 자기 서버에 공개 페이지를 요청해(서명된 헤더) 저장본을 새로 만든다:
 * 홈·규칙·정책 문서·라벨 변경 이력, 방과 방 제품 목록·라벨 변경 이력, 최근 90일 추천 많은 글과 최근 글, 글이 많은 제품.
 * 이용자가 연 글·제품 페이지도 저장본이 없거나 오래됐으면 같은 방식(아무 기록 없는 방문자)으로 곧 다시 받아 둔다.
 * DB 가 멈춘 동안에는 받지 않는다 (지금 가진 저장본을 지킨다).
 */
import { config } from "../config";
import { dbDown, query } from "../db";
import { reportError } from "../error-tracking";
import {
  baseKey, listSnapshotKeys, MAX_SNAPSHOT_FILES, pruneSnapshots, SNAPSHOT_HEADER, SNAPSHOT_UA, snapshotKey, snapshotSavedAt, snapshotStats, snapshotToken,
} from "../snapshots";

const STATIC_PAGES = ["/", "/rules", "/policy", "/terms", "/privacy", "/transparency", "/renewals"];
/** 이보다 오래 안 바뀐 저장본은 지운다 */
const MAX_AGE_MS = 7 * 24 * 3600_000;

/** 수집할 주소 목록 (DB 에서) */
export async function snapshotTargets(posts = config.snapshotPosts, products = config.snapshotProducts): Promise<string[]> {
  const [cats, ps, prs] = await Promise.all([
    query<{ slug: string }>("SELECT slug FROM categories ORDER BY id"),
    posts > 0
      ? query<{ id: string }>(
          `(SELECT id::text FROM posts WHERE NOT is_blinded AND NOT is_suppressed AND created_at > now() - interval '90 days'
             ORDER BY (upvotes - downvotes) DESC, id DESC LIMIT $1)
           UNION
           (SELECT id::text FROM posts WHERE NOT is_blinded AND NOT is_suppressed ORDER BY id DESC LIMIT $2)`,
          [Math.ceil(posts / 2), Math.floor(posts / 2)],
        )
      : Promise.resolve([]),
    products > 0
      ? query<{ id: string }>(
          `SELECT pp.product_id::text AS id FROM post_products pp JOIN posts p ON p.id = pp.post_id
            WHERE NOT p.is_blinded AND NOT p.is_suppressed AND p.created_at > now() - interval '90 days'
            GROUP BY pp.product_id ORDER BY count(*) DESC, pp.product_id DESC LIMIT $1`,
          [products],
        )
      : Promise.resolve([]),
  ]);
  return [
    ...STATIC_PAGES,
    ...cats.flatMap((c) => [`/c/${encodeURIComponent(c.slug)}`, `/c/${encodeURIComponent(c.slug)}/products`, `/c/${encodeURIComponent(c.slug)}/renewals`]),
    ...ps.map((p) => `/posts/${p.id}`),
    ...prs.map((p) => `/p/${p.id}`),
  ];
}

/** 자기 서버에 아무 기록 없는 방문자로 페이지를 요청한다 — 저장은 server.ts 가 응답을 보내며 한다 */
export async function fetchForSnapshot(url: string, port = Number(process.env.PORT) || 3000): Promise<number> {
  // 특정 주소에만 열어 둔 서버(HOST)면 그 주소로
  const h = process.env.HOST;
  const host = h && h !== "0.0.0.0" && h !== "::" ? (h.includes(":") ? `[${h}]` : h) : "127.0.0.1";
  const res = await fetch(`http://${host}:${port}${url}`, {
    headers: { [SNAPSHOT_HEADER]: snapshotToken(), "user-agent": SNAPSHOT_UA, accept: "text/html", "accept-encoding": "identity" },
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  await res.arrayBuffer().catch(() => {});
  return res.status;
}

export type SnapshotRunResult = { ran: boolean; fetched: number; skipped: number; failed: number; removed: number };

/** 한 바퀴: 저장본이 없거나 주기의 절반보다 오래된 페이지만 다시 받는다 */
export async function refreshSnapshots(opts: { freshMs?: number; port?: number } = {}): Promise<SnapshotRunResult> {
  if (dbDown()) return { ran: false, fetched: 0, skipped: 0, failed: 0, removed: 0 };
  const freshMs = opts.freshMs ?? (config.snapshotIntervalSec * 1000) / 2;
  // 이미 가진 저장본도 다시 받는다 — 그 사이 지워진 글(404 → 저장본 삭제)·블라인드된 글(가린 화면으로 바뀜)을 반영 (Sprint 29)
  const targets = [...new Set([...(await snapshotTargets()), ...(await listSnapshotKeys())])];
  let fetched = 0; // 200 을 받은 수 (저장은 server.ts 가 응답을 보내며 한다)
  let skipped = 0;
  let failed = 0;
  for (const url of targets) {
    if (dbDown()) break;
    const at = await snapshotSavedAt(snapshotKey(url)!);
    if (at !== null && Date.now() - at < freshMs) {
      skipped++;
      continue;
    }
    try {
      const status = await fetchForSnapshot(url, opts.port);
      if (status === 200) fetched++;
      else failed++;
    } catch {
      failed++;
    }
  }
  const { removed } = await pruneSnapshots(MAX_AGE_MS);
  return { ran: true, fetched, skipped, failed, removed };
}

// 이용자가 연 글·제품 페이지 → 저장본을 곧 받아 둔다 (워커마다, 1초에 하나, 최대 200개 대기)
const queue: string[] = [];
const queued = new Set<string>();
let draining = false;

let fileCount = { at: 0, n: 0 };

export function requestSnapshot(rawKey: string): void {
  // 이용자 요청으로는 조건 없는 주소만 (임의 조건으로 저장본을 무한히 늘리지 못하게) + 파일 수 상한 (Sprint 29)
  const key = baseKey(rawKey);
  if (config.snapshotIntervalSec <= 0 || queued.has(key) || queue.length >= 200) return;
  if (Date.now() - fileCount.at > 60_000) {
    fileCount = { at: Date.now(), n: fileCount.n };
    void snapshotStats().then((s) => (fileCount = { at: Date.now(), n: s.count })).catch(() => {});
  }
  if (fileCount.n >= MAX_SNAPSHOT_FILES) return;
  queued.add(key);
  queue.push(key);
  if (!draining) void drain();
}

async function drain() {
  draining = true;
  try {
    while (queue.length) {
      const key = queue.shift()!;
      queued.delete(key);
      if (dbDown()) continue;
      const at = await snapshotSavedAt(key);
      if (at !== null && Date.now() - at < (config.snapshotIntervalSec * 1000) / 2) continue;
      await fetchForSnapshot(key).catch(() => {});
      await new Promise((r) => setTimeout(r, 1000));
    }
  } finally {
    draining = false;
  }
}

export function startSnapshotScheduler(intervalMs: number): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await refreshSnapshots();
      if (r.ran && r.failed) console.warn(`[snapshot] ${r.fetched}개 저장, ${r.failed}개 실패`);
    } catch (err) {
      if (!dbDown()) {
        console.error("[snapshot] failed:", (err as Error).message);
        reportError(err, { kind: "job", where: "snapshot" });
      }
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  // 서버가 다 뜬 뒤 첫 수집 (바로 하면 자기 자신에게 요청할 수 없음)
  setTimeout(tick, 15_000).unref();
  return () => clearInterval(timer);
}
