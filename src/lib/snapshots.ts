/**
 * 읽기 전용 모드용 페이지 저장본 (Sprint 27, 서버 전용 — server.ts 와 배치에서 쓴다).
 *
 * DB 가 멈추면 지금까지는 모든 페이지가 500 이었다. 대신 최근에 저장해 둔 공개 페이지(홈·보드·글·제품·규칙 등)를
 * "읽기 전용" 안내와 함께 보여준다.
 *
 * - 저장본은 **내부 수집기만** 만든다 (서명된 헤더를 단 요청). 이용자 요청의 화면에는 그 사람의 추천·참석·투표 상태가
 *   들어 있어 다른 사람에게 보여주면 안 되기 때문 — 수집기는 아무 기록이 없는 방문자로 화면을 받아 저장한다.
 * - 빌드마다 따로 저장한다 (화면이 가리키는 JS·CSS 파일 이름이 빌드마다 달라서).
 * - 여러 워커·재시작이 같은 저장본을 쓰도록 디스크(SNAPSHOT_DIR)에 둔다.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { config } from "./config";

export const SNAPSHOT_HEADER = "x-lr-snapshot";
export const SNAPSHOT_UA = "labelrep-snapshot/1";

/** 저장·제공하는 공개 페이지 (개인 화면·관리자·글쓰기·검색은 제외) */
const PATHS: RegExp[] = [
  /^\/$/,
  /^\/c\/[^/]{1,80}$/,
  /^\/c\/[^/]{1,80}\/(products|facts)$/,
  /^\/posts\/\d{1,18}$/,
  /^\/p\/\d{1,18}$/,
  /^\/(rules|policy|terms|privacy|transparency)$/,
];
/** 주소의 이 조건만 저장본을 나눈다 (나머지 조건은 떼고 같은 저장본) */
const KEPT_PARAMS = new Set(["page", "sort", "attr", "basis"]);

/** 요청 주소 → 저장본 키 ("/c/supplements?page=2"). 대상이 아니면 null */
export function snapshotKey(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url, "http://x");
  } catch {
    return null;
  }
  let pathname: string;
  try {
    pathname = decodeURIComponent(u.pathname);
  } catch {
    return null;
  }
  if (!PATHS.some((re) => re.test(pathname))) return null;
  const kept = [...u.searchParams.entries()]
    .filter(([k, v]) => KEPT_PARAMS.has(k) && v.length <= 60)
    .sort(([a], [b]) => a.localeCompare(b));
  if (kept.length > 4) return null;
  const qs = new URLSearchParams(kept).toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** 조건을 뗀 키 — 정확한 저장본이 없으면 이것으로 ("/c/supplements?sort=latest" → "/c/supplements") */
export function baseKey(key: string): string {
  return key.split("?")[0]!;
}

let cachedBuild: string | undefined;
export function buildId(): string {
  if (cachedBuild) return cachedBuild;
  try {
    cachedBuild = readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    cachedBuild = "dev";
  }
  return cachedBuild;
}

function fileFor(key: string, dir = config.snapshotDir): string {
  return path.join(dir, buildId(), `${createHash("sha1").update(key).digest("hex")}.html`);
}

export function snapshotToken(): string {
  return createHmac("sha256", config.appSecret).update("labelrep-snapshot-v1").digest("hex").slice(0, 40);
}

/** 내부 수집기의 요청인가 (서명된 헤더) */
export function isSnapshotRequest(value: string | string[] | undefined): boolean {
  if (typeof value !== "string") return false;
  const want = Buffer.from(snapshotToken());
  const got = Buffer.from(value);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function saveSnapshot(key: string, html: string): Promise<void> {
  const file = fileFor(key);
  await mkdir(path.dirname(file), { recursive: true });
  // 다른 워커가 읽는 중에 반쪽 파일을 보지 않게 임시 파일에 쓰고 바꿔 끼운다
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, html, "utf8");
  await rename(tmp, file);
}

export async function snapshotSavedAt(key: string): Promise<number | null> {
  try {
    return (await stat(fileFor(key))).mtimeMs;
  } catch {
    return null;
  }
}

/** 저장본 읽기 — 정확한 키가 없으면 조건을 뗀 키 */
export async function loadSnapshot(key: string): Promise<{ html: string; savedAt: number; key: string } | null> {
  for (const k of key === baseKey(key) ? [key] : [key, baseKey(key)]) {
    try {
      const file = fileFor(k);
      const [html, st] = await Promise.all([readFile(file, "utf8"), stat(file)]);
      return { html, savedAt: st.mtimeMs, key: k };
    } catch {
      /* 다음 후보 */
    }
  }
  return null;
}

const KST = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

export function readOnlyNotice(savedAt: number): string {
  return `⚠️ 지금은 서버 점검 중이라 읽기만 할 수 있어요 · ${KST.format(new Date(savedAt))} 기준 화면 · 글쓰기·추천·댓글은 잠시 뒤 다시 해 주세요`;
}

const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * 저장본에 읽기 전용 안내를 붙인다. 요소를 끼워 넣으면 React 하이드레이션이 어긋날 수 있어,
 * <body> 속성 하나만 더하고 CSS(body[data-lr-readonly]::before, globals.css)가 안내 띠를 그린다.
 */
export function withReadOnlyNotice(html: string, savedAt: number): string {
  return html.replace(/<body\b/i, `<body data-lr-readonly="${escAttr(readOnlyNotice(savedAt))}"`);
}

/** 오래된 저장본 정리: 지금 빌드가 아닌 폴더, maxAgeMs 보다 오래된 파일 */
export async function pruneSnapshots(maxAgeMs: number, now = Date.now()): Promise<{ removed: number }> {
  let removed = 0;
  let dirs: string[] = [];
  try {
    dirs = await readdir(config.snapshotDir);
  } catch {
    return { removed };
  }
  for (const d of dirs) {
    const full = path.join(config.snapshotDir, d);
    if (d !== buildId()) {
      await rm(full, { recursive: true, force: true });
      removed++;
      continue;
    }
    for (const f of await readdir(full).catch(() => [] as string[])) {
      const p = path.join(full, f);
      const st = await stat(p).catch(() => null);
      if (st && now - st.mtimeMs > maxAgeMs) {
        await unlink(p).catch(() => {});
        removed++;
      }
    }
  }
  return { removed };
}

export async function snapshotStats(): Promise<{ count: number; newest: number | null }> {
  const dir = path.join(config.snapshotDir, buildId());
  let count = 0;
  let newest: number | null = null;
  for (const f of await readdir(dir).catch(() => [] as string[])) {
    if (!f.endsWith(".html")) continue;
    count++;
    const st = await stat(path.join(dir, f)).catch(() => null);
    if (st && (newest === null || st.mtimeMs > newest)) newest = st.mtimeMs;
  }
  return { count, newest };
}

/** 저장본이 없을 때 보여줄 점검 안내 (DB 없이 만든다) */
export function outagePage(hasHome: boolean): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>잠시 점검 중 — 라벨공화국</title>
<style>body{font-family:system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;max-width:560px;margin:0 auto;padding:40px 16px;line-height:1.6;color:#1d2521;background:#f7f6f1}
@media (prefers-color-scheme:dark){body{color:#e8ece9;background:#141816}a{color:#8fd3b0}}a{color:#1f6b4a}</style></head>
<body><main><h1>잠시 점검 중이에요</h1>
<p>서버가 데이터베이스에 연결하지 못하고 있어요. 이 페이지는 아직 저장본이 없어 보여드릴 수 없어요.</p>
<ul>${hasHome ? '<li><a href="/">홈(저장된 화면) 보기</a></li>' : ""}<li><a href="/offline">이 기기에 저장한 글 보기</a></li></ul>
<p>보통 몇 분 안에 돌아와요. 잠시 뒤 새로고침해 주세요.</p></main></body></html>`;
}
