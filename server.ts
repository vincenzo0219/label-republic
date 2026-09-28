/**
 * Next.js 커스텀 서버 + 경량 실시간 댓글 WebSocket.
 *
 *   ws://host/ws/comments?postId=123
 *
 * 댓글 INSERT/DELETE 시 DB 트리거가 pg_notify('comment_events')를 보내고,
 * 이 서버가 LISTEN 하다가 해당 게시글을 구독 중인 소켓에만 전달한다.
 * API 라우트와 WebSocket이 DB를 통해서만 연결되므로 여러 인스턴스로 늘려도 그대로 동작한다.
 * 서버→클라이언트 단방향 푸시만 하며, 댓글 작성은 일반 REST API(POST /api/posts/:id/comments)로 한다.
 *
 * WEB_CONCURRENCY ≥ 2 이면 node:cluster 로 워커를 그 수만큼 띄워 CPU 코어를 모두 쓴다.
 * 워커끼리는 DB로만 연결되므로(LISTEN/NOTIFY, advisory lock, Postgres 레이트 리밋) 여러 인스턴스와 같은 방식으로 동작한다.
 * 배치 스케줄러는 0번 워커에서만 돌린다.
 */
import cluster from "node:cluster";
import { createServer, type IncomingMessage } from "node:http";
import next from "next";
import { Client } from "pg";
import { WebSocket, WebSocketServer } from "ws";
import { checkAdminAuth, isAdminPath } from "./src/lib/admin-auth";
import { config } from "./src/lib/config";
import { pool } from "./src/lib/db";
import { checkEnv } from "./src/lib/env-check";
import { checkCsrf } from "./src/lib/csrf";
import { flushErrors, reportError } from "./src/lib/error-tracking";
import { CLIENT_IP_HEADER, clientIpFrom } from "./src/lib/fingerprint";
import { flushViewCounts } from "./src/lib/metrics";
import { hit, isLimited } from "./src/lib/rate-limit";
import { startCuratorScheduler } from "./src/lib/jobs/curator";
import { startDigestScheduler } from "./src/lib/jobs/digest";
import { startSourceCheckScheduler } from "./src/lib/jobs/sources";
import { startPushScheduler } from "./src/lib/jobs/push";
import { startMaintenanceScheduler } from "./src/lib/jobs/maintenance";
import { startTrustScheduler } from "./src/lib/jobs/trust";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT) || 3000;
const hostname = process.env.HOST || "0.0.0.0";
const databaseUrl = process.env.DATABASE_URL ?? "postgres://labelrep:labelrep@localhost:5432/labelrep";

const MAX_SOCKETS_PER_POST = 500;
const MAX_SOCKETS_PER_IP = 20;
const socketsPerIp = new Map<string, number>();

// 운영에서 치명적인 설정 누락이 있으면 시작하지 않는다
const envReport = checkEnv(process.env, !dev);
for (const w of envReport.warnings) console.warn(`[env] 경고: ${w}`);
// 로컬에서 운영 빌드를 시험할 때만 ENV_CHECK=warn 으로 오류를 경고로 낮출 수 있다 (운영 배포에서는 쓰지 말 것)
if (envReport.errors.length && process.env.ENV_CHECK === "warn") {
  for (const e of envReport.errors) console.warn(`[env] 경고(ENV_CHECK=warn): ${e}`);
} else if (envReport.errors.length) {
  for (const e of envReport.errors) console.error(`[env] 오류: ${e}`);
  console.error("[env] 환경변수를 확인하세요 (.env.example 참고). 서버를 시작하지 않습니다.");
  process.exit(1);
}

let shuttingDown = false;
let listenClient: Client | null = null;
const workerIndex = Number(process.env.LR_WORKER_INDEX ?? 0);

// postId → 구독 소켓
const rooms = new Map<string, Set<WebSocket>>();

function subscribe(postId: string, ws: WebSocket): boolean {
  let room = rooms.get(postId);
  if (!room) rooms.set(postId, (room = new Set()));
  if (room.size >= MAX_SOCKETS_PER_POST) return false;
  room.add(ws);
  ws.on("close", () => {
    room!.delete(ws);
    if (room!.size === 0) rooms.delete(postId);
  });
  return true;
}

function broadcast(raw: string) {
  let postId: string;
  try {
    postId = String(JSON.parse(raw).comment.post_id);
  } catch {
    return;
  }
  for (const ws of rooms.get(postId) ?? []) {
    if (ws.readyState === WebSocket.OPEN) ws.send(raw);
  }
}

async function listen(): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  listenClient = client;
  let retried = false;
  const retry = () => {
    if (shuttingDown || retried) return;
    retried = true;
    client.removeAllListeners();
    // 끊기는 연결은 뒤이어 오류를 한 번 더 낼 수 있다 — 받을 곳이 없으면 워커가 죽는다 (Sprint 24 리허설에서 발견)
    client.on("error", () => {});
    client.end().catch(() => {});
    setTimeout(() => listen().catch(() => {}), 3000);
  };
  client.on("error", (err) => {
    console.error("[realtime] LISTEN connection error:", err.message);
    retry();
  });
  client.on("notification", (msg) => {
    if (msg.channel === "comment_events" && msg.payload) broadcast(msg.payload);
  });
  try {
    await client.connect();
    await client.query("LISTEN comment_events");
    console.log("[realtime] listening on comment_events");
  } catch (err) {
    console.error("[realtime] could not LISTEN:", (err as Error).message);
    retry();
  }
}

function withClientIp(req: IncomingMessage) {
  // 클라이언트가 보낸 값은 덮어써서 fingerprint 위조를 막는다.
  req.headers[CLIENT_IP_HEADER] = req.socket.remoteAddress ?? "unknown";
}

function runPrimary(workers: number) {
  console.log(`> 라벨공화국 cluster: 워커 ${workers}개 시작 (WEB_CONCURRENCY)`);
  let stopping = false;
  const fork = (index: number) => {
    const w = cluster.fork({ LR_WORKER_INDEX: String(index) });
    w.on("exit", (code, signal) => {
      if (stopping) return;
      console.error(`[cluster] 워커 ${index} 종료 (code=${code}, signal=${signal}) — 1초 뒤 다시 띄웁니다`);
      setTimeout(() => fork(index), 1000);
    });
  };
  for (let i = 0; i < workers; i++) fork(i);
  const stop = (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    console.log(`[cluster] ${signal} 수신, 워커 종료 대기…`);
    for (const w of Object.values(cluster.workers ?? {})) w?.process.kill(signal);
    const force = setTimeout(() => process.exit(1), 12_000);
    force.unref();
    const check = setInterval(() => {
      if (Object.keys(cluster.workers ?? {}).length === 0) {
        clearInterval(check);
        process.exit(0);
      }
    }, 200);
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));
}

function startWorker() {
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();
  app.prepare().then(async () => {
    const upgradeNext = app.getUpgradeHandler();
    const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });

    const hsts = config.siteUrl.startsWith("https://");
    const allowedOrigins = [config.siteUrl, ...config.extraAllowedOrigins];
    const ipOf = (req: IncomingMessage) =>
      clientIpFrom(req.headers["x-forwarded-for"] as string | undefined, req.socket.remoteAddress, config.trustProxy, config.trustProxyHops);
    const sendJson = (res: import("node:http").ServerResponse, status: number, code: string, message: string) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ error: { code, message } }));
    };

    const server = createServer(async (req, res) => {
      withClientIp(req);
      if (hsts) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      const pathname = (req.url ?? "/").split("?")[0]!;

      // CSRF: 상태를 바꾸는 /api/* 요청은 우리 사이트에서 보낸 JSON 요청만 받는다
      const csrf = checkCsrf({
        method: req.method ?? "GET",
        pathname,
        origin: req.headers.origin,
        secFetchSite: req.headers["sec-fetch-site"] as string | undefined,
        referer: req.headers.referer,
        contentType: req.headers["content-type"],
        hasBody: Number(req.headers["content-length"] ?? 0) > 0 || req.headers["transfer-encoding"] !== undefined,
        // 개발 모드에서는 접속한 호스트 그대로도 허용 (localhost:포트가 SITE_URL 과 다를 수 있음)
        allowedOrigins: dev && req.headers.host ? [...allowedOrigins, `http://${req.headers.host}`] : allowedOrigins,
      });
      if (!csrf.ok) return sendJson(res, csrf.status, csrf.code, csrf.message);

      // 운영 대시보드: ADMIN_PASSWORD 가 없으면 404, 있으면 Basic 인증 (실패 15분 10회 초과 시 잠금)
      if (isAdminPath(pathname)) {
        const lockKey = `admin-auth:${ipOf(req)}`;
        if (config.adminPassword && (await isLimited(lockKey, 10, 15 * 60 * 1000).catch(() => false))) {
          return sendJson(res, 429, "rate_limited", "로그인 시도가 너무 많습니다. 15분 뒤 다시 시도하세요.");
        }
        const auth = checkAdminAuth(req.headers.authorization, config.adminPassword);
        if (auth === "unauthorized" && req.headers.authorization) await hit(lockKey, 10, 15 * 60 * 1000).catch(() => true);
        if (auth !== "ok") {
          res.statusCode = auth === "disabled" ? 404 : 401;
          if (auth === "unauthorized") res.setHeader("WWW-Authenticate", 'Basic realm="labelrepublic-admin", charset="UTF-8"');
          res.setHeader("X-Robots-Tag", "noindex, nofollow");
          res.setHeader("Cache-Control", "no-store");
          res.end(auth === "disabled" ? "Not found" : "Unauthorized");
          return;
        }
        res.setHeader("X-Robots-Tag", "noindex, nofollow");
        res.setHeader("Cache-Control", "no-store");
      }
      handle(req, res);
    });

    server.on("upgrade", (req, socket, head) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname !== "/ws/comments") {
        // dev HMR 등 Next.js 내부 WebSocket
        upgradeNext(req, socket, head);
        return;
      }
      const postId = url.searchParams.get("postId") ?? "";
      if (!/^\d{1,18}$/.test(postId)) {
        socket.destroy();
        return;
      }
      // 한 IP가 소켓을 대량으로 열어 서버 자원을 고갈시키지 못하게 제한
      const ip = ipOf(req);
      if ((socketsPerIp.get(ip) ?? 0) >= MAX_SOCKETS_PER_IP) {
        socket.write("HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        socketsPerIp.set(ip, (socketsPerIp.get(ip) ?? 0) + 1);
        ws.on("close", () => {
          const n = (socketsPerIp.get(ip) ?? 1) - 1;
          if (n <= 0) socketsPerIp.delete(ip);
          else socketsPerIp.set(ip, n);
        });
        if (!subscribe(postId, ws)) {
          ws.close(1013, "room full");
          return;
        }
        (ws as WebSocket & { alive?: boolean }).alive = true;
        ws.on("pong", () => ((ws as WebSocket & { alive?: boolean }).alive = true));
        // 클라이언트 → 서버 메시지는 사용하지 않는다.
        ws.on("message", () => {});
      });
    });

    // 죽은 연결 정리
    const heartbeat = setInterval(() => {
      for (const ws of wss.clients as Set<WebSocket & { alive?: boolean }>) {
        if (!ws.alive) {
          ws.terminate();
          continue;
        }
        ws.alive = false;
        ws.ping();
      }
    }, 30_000);
    wss.on("close", () => clearInterval(heartbeat));

    await listen();
    // 배치들은 advisory lock으로 여러 인스턴스 중 한 곳에서만 실행된다. cluster 에서는 0번 워커만 스케줄한다.
    if (workerIndex === 0) {
      // 신뢰도 배지 배치
      if (config.trustRefreshIntervalSec > 0) startTrustScheduler(config.trustRefreshIntervalSec * 1000);
      // AI 큐레이터 "활성화 유지" — 사람 글이 늘면 자동으로 물러난다.
      if (config.curatorIntervalSec > 0) startCuratorScheduler(config.curatorIntervalSec * 1000);
      // 어뷰징 탐지 · 보류된 보드 승격 · 오래된 지표 정리
      if (config.maintenanceIntervalSec > 0) startMaintenanceScheduler(config.maintenanceIntervalSec * 1000);
      // 보드별 주간 다이제스트 (개인화 리포트용, 보드 단위 공유 캐시)
      if (config.digestIntervalSec > 0) startDigestScheduler(config.digestIntervalSec * 1000);
      // 출처 링크 생존 확인 (외부 사이트에 요청 — 사설 주소는 차단)
      if (config.sourceCheckIntervalSec > 0) startSourceCheckScheduler(config.sourceCheckIntervalSec * 1000);
      if (config.pushEnabled && config.pushIntervalSec > 0) startPushScheduler(config.pushIntervalSec * 1000);
    }
    // 게시글 조회수 버퍼 반영
    const viewFlush = setInterval(() => flushViewCounts().catch((e) => console.error("[views] flush 실패:", (e as Error).message)), 10_000);
    viewFlush.unref();
    server.listen(port, hostname, () => {
      const who = cluster.isWorker ? ` [워커 ${workerIndex}]` : "";
      console.log(`> 라벨공화국 ready on http://${hostname}:${port} (${dev ? "dev" : "prod"})${who}`);
    });

    // 컨테이너 종료(SIGTERM) 시: 새 연결 거부 → 웹소켓 정리 → 진행 중 요청 마무리 → DB 풀 종료
    const shutdown = (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`[shutdown] ${signal} 수신, 정리 중…`);
      const force = setTimeout(() => {
        console.error("[shutdown] 10초 안에 끝나지 않아 강제 종료합니다.");
        process.exit(1);
      }, 10_000);
      force.unref();
      for (const ws of wss.clients) ws.close(1001, "server shutting down");
      clearInterval(heartbeat);
      clearInterval(viewFlush);
      server.close(async () => {
        await flushViewCounts().catch(() => {});
        await flushErrors().catch(() => {});
        await listenClient?.end().catch(() => {});
        await pool().end().catch(() => {});
        console.log("[shutdown] 완료");
        process.exit(0);
      });
      server.closeIdleConnections?.();
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
    // 처리되지 않은 오류: 기록은 남기고, 예외는 상태가 깨졌을 수 있어 기록 후 재시작(프로세스 관리자·cluster 가 다시 띄움)
    process.on("unhandledRejection", (reason) => {
      console.error("[process] unhandledRejection", reason);
      reportError(reason, { kind: "process", where: "unhandledRejection" });
    });
    process.on("uncaughtException", (err) => {
      console.error("[process] uncaughtException", err);
      reportError(err, { kind: "process", where: "uncaughtException" });
      void flushErrors().finally(() => process.exit(1));
      setTimeout(() => process.exit(1), 3000).unref();
    });
  });
}

if (cluster.isPrimary && !dev && config.webConcurrency > 1) runPrimary(config.webConcurrency);
else startWorker();
