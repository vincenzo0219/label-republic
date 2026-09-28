/**
 * 읽기 전용 모드의 HTTP 처리 (Sprint 27, server.ts 전용) — 저장본 만들기·보내기, 렌더링이 5xx 로 끝나면 저장본으로 바꿔 보내기.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { securityHeaders } from "./security-headers";
import { loadSnapshot, outagePage, saveSnapshot, snapshotSavedAt, withReadOnlyNotice } from "./snapshots";

/** 페이지 이동 요청인가 (HTML). Next 의 클라이언트 이동(RSC)·프리페치는 아니다 */
export function isHtmlNavigation(req: IncomingMessage): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  if (isRscRequest(req)) return false;
  const accept = String(req.headers.accept ?? "");
  return accept === "" || accept.includes("text/html") || accept.includes("*/*");
}

export function isRscRequest(req: IncomingMessage): boolean {
  return req.headers.rsc === "1" || req.headers["next-router-prefetch"] !== undefined || (req.url ?? "").includes("_rsc=");
}

/** 저장본을 읽기 전용 안내와 함께 보낸다. 없으면 점검 안내(503). 보냈으면 true */
export async function sendSnapshot(req: IncomingMessage, res: ServerResponse, key: string | null): Promise<boolean> {
  const snap = key ? await loadSnapshot(key) : null;
  for (const h of securityHeaders) res.setHeader(h.key, h.value);
  if (!snap) {
    const hasHome = (await snapshotSavedAt("/")) !== null;
    res.statusCode = 503;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Retry-After", "30");
    res.setHeader("X-Robots-Tag", "noindex");
    res.end(req.method === "HEAD" ? undefined : outagePage(hasHome));
    return false;
  }
  const body = withReadOnlyNotice(snap.html, snap.savedAt);
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // 점검이 끝나면 바로 최신 화면을 받도록 어디에도 저장하지 않게
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  res.setHeader("X-LR-Read-Only", "1");
  res.setHeader("Content-Length", Buffer.byteLength(body));
  res.end(req.method === "HEAD" ? undefined : body);
  return true;
}

type Chunk = string | Uint8Array;
const toBuf = (c: Chunk, enc?: BufferEncoding) => (typeof c === "string" ? Buffer.from(c, enc) : Buffer.from(c));

/** 응답을 그대로 보내면서 복사해 두었다가, 200 HTML(압축 안 됨)이면 저장본으로 남긴다 (내부 수집기 요청에만) */
export function captureSnapshot(res: ServerResponse, key: string, onSaved?: (ok: boolean) => void): void {
  const chunks: Buffer[] = [];
  let size = 0;
  const LIMIT = 3 * 1024 * 1024;
  const write = res.write.bind(res) as (...a: unknown[]) => boolean;
  const end = res.end.bind(res) as (...a: unknown[]) => ServerResponse;
  const keep = (c: unknown, enc: unknown) => {
    if (c === undefined || c === null || typeof c === "function") return;
    const b = toBuf(c as Chunk, typeof enc === "string" ? (enc as BufferEncoding) : undefined);
    size += b.length;
    if (size <= LIMIT) chunks.push(b);
  };
  res.write = ((c: unknown, enc?: unknown, cb?: unknown) => {
    keep(c, enc);
    return write(c, enc, cb);
  }) as ServerResponse["write"];
  res.end = ((c?: unknown, enc?: unknown, cb?: unknown) => {
    keep(c, enc);
    const r = end(c, enc, cb);
    const type = String(res.getHeader("content-type") ?? "");
    const ok = res.statusCode === 200 && type.startsWith("text/html") && !res.getHeader("content-encoding") && size <= LIMIT && size > 0;
    if (ok) {
      saveSnapshot(key, Buffer.concat(chunks).toString("utf8")).then(
        () => onSaved?.(true),
        (err) => {
          console.error("[snapshot] 저장 실패:", (err as Error).message);
          onSaved?.(false);
        },
      );
    } else onSaved?.(false);
    return r;
  }) as ServerResponse["end"];
}

/**
 * 렌더링이 5xx 로 끝났고 when() 이 참이면 (DB 가 막 끊긴 순간) Next 가 보내려던 오류 화면 대신 fallback 을 부른다.
 * 상태 코드는 헤더를 보내기 직전(writeHead·첫 write)에 확인한다 — 그 전까지는 아무것도 보내지 않았으므로 바꿔 보낼 수 있다.
 */
export function onServerError(res: ServerResponse, when: () => boolean, fallback: () => Promise<boolean>): void {
  const origWriteHead = res.writeHead;
  const origWrite = res.write;
  const origEnd = res.end;
  let decided = false;
  let swallow = false;
  const decide = () => {
    if (decided) return;
    decided = true;
    // DB 장애일 때만 바꾼다 — 코드 버그로 난 500 은 그대로 보여야 고칠 수 있다
    swallow = res.statusCode >= 500 && !res.headersSent && when();
  };
  // 통과시킬 때는 원래 함수로 되돌려 끼우지 않는다 — Next 의 압축이 이 위에 다시 감싸 두었을 수 있어서
  // (되돌려 끼우면 압축을 건너뛴 본문이 gzip 헤더와 함께 나간다)
  res.writeHead = function (this: ServerResponse, status: number, ...rest: unknown[]) {
    res.statusCode = status;
    decide();
    if (swallow) return res;
    return (origWriteHead as (...a: unknown[]) => ServerResponse).call(res, status, ...rest);
  } as ServerResponse["writeHead"];
  res.write = function (this: ServerResponse, ...args: unknown[]) {
    decide();
    if (swallow) return true;
    return (origWrite as (...a: unknown[]) => boolean).apply(res, args);
  } as ServerResponse["write"];
  res.end = function (this: ServerResponse, ...args: unknown[]) {
    decide();
    if (!swallow) return (origEnd as (...a: unknown[]) => ServerResponse).apply(res, args);
    // 대체 화면은 압축 등 위에 감싼 것을 모두 건너뛰고 원래 함수로 보낸다
    res.writeHead = origWriteHead;
    res.write = origWrite;
    res.end = origEnd;
    const cb = args.find((a) => typeof a === "function") as (() => void) | undefined;
    for (const h of ["content-type", "content-length", "content-encoding", "etag", "cache-control", "vary", "x-nextjs-cache", "link"]) res.removeHeader(h);
    fallback()
      .catch((err) => {
        console.error("[snapshot] 대체 화면 실패:", (err as Error).message);
        if (!res.headersSent) {
          res.statusCode = 503;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
        }
        if (!res.writableEnded) res.end("Service Unavailable");
      })
      .finally(() => cb?.());
    return res;
  } as ServerResponse["end"];
}
