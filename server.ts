/**
 * Next.js 커스텀 서버 + 경량 실시간 댓글 WebSocket.
 *
 *   ws://host/ws/comments?postId=123
 *
 * 댓글 INSERT/DELETE 시 DB 트리거가 pg_notify('comment_events')를 보내고,
 * 이 서버가 LISTEN 하다가 해당 게시글을 구독 중인 소켓에만 전달한다.
 * API 라우트와 WebSocket이 DB를 통해서만 연결되므로 여러 인스턴스로 늘려도 그대로 동작한다.
 * 서버→클라이언트 단방향 푸시만 하며, 댓글 작성은 일반 REST API(POST /api/posts/:id/comments)로 한다.
 */
import { createServer, type IncomingMessage } from "node:http";
import next from "next";
import { Client } from "pg";
import { WebSocket, WebSocketServer } from "ws";
import { checkAdminAuth, isAdminPath } from "./src/lib/admin-auth";
import { config } from "./src/lib/config";
import { pool } from "./src/lib/db";
import { checkEnv } from "./src/lib/env-check";
import { CLIENT_IP_HEADER } from "./src/lib/fingerprint";
import { startCuratorScheduler } from "./src/lib/jobs/curator";
import { startDigestScheduler } from "./src/lib/jobs/digest";
import { startMaintenanceScheduler } from "./src/lib/jobs/maintenance";
import { startTrustScheduler } from "./src/lib/jobs/trust";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT) || 3000;
const hostname = process.env.HOST || "0.0.0.0";
const databaseUrl = process.env.DATABASE_URL ?? "postgres://labelrep:labelrep@localhost:5432/labelrep";

const MAX_SOCKETS_PER_POST = 500;

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

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

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
  const retry = () => {
    if (shuttingDown) return;
    client.removeAllListeners();
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

app.prepare().then(async () => {
  const upgradeNext = app.getUpgradeHandler();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });

  const hsts = config.siteUrl.startsWith("https://");
  const server = createServer((req, res) => {
    withClientIp(req);
    if (hsts) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    // 운영 대시보드: ADMIN_PASSWORD 가 없으면 404, 있으면 Basic 인증
    const pathname = (req.url ?? "/").split("?")[0]!;
    if (isAdminPath(pathname)) {
      const auth = checkAdminAuth(req.headers.authorization, config.adminPassword);
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
    wss.handleUpgrade(req, socket, head, (ws) => {
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
  // 신뢰도 배지 배치 — advisory lock으로 여러 인스턴스 중 한 곳에서만 실행된다.
  if (config.trustRefreshIntervalSec > 0) startTrustScheduler(config.trustRefreshIntervalSec * 1000);
  // AI 큐레이터 "활성화 유지" — 사람 글이 늘면 자동으로 물러난다.
  if (config.curatorIntervalSec > 0) startCuratorScheduler(config.curatorIntervalSec * 1000);
  // 어뷰징 탐지 · 보류된 보드 승격 · 오래된 지표 정리
  if (config.maintenanceIntervalSec > 0) startMaintenanceScheduler(config.maintenanceIntervalSec * 1000);
  // 보드별 주간 다이제스트 (개인화 리포트용, 보드 단위 공유 캐시)
  if (config.digestIntervalSec > 0) startDigestScheduler(config.digestIntervalSec * 1000);
  server.listen(port, hostname, () => {
    console.log(`> 라벨공화국 ready on http://${hostname}:${port} (${dev ? "dev" : "prod"})`);
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
    server.close(async () => {
      await listenClient?.end().catch(() => {});
      await pool().end().catch(() => {});
      console.log("[shutdown] 완료");
      process.exit(0);
    });
    server.closeIdleConnections?.();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
});
