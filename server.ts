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
import { config } from "./src/lib/config";
import { CLIENT_IP_HEADER } from "./src/lib/fingerprint";
import { startCuratorScheduler } from "./src/lib/jobs/curator";
import { startTrustScheduler } from "./src/lib/jobs/trust";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT) || 3000;
const hostname = process.env.HOST || "0.0.0.0";
const databaseUrl = process.env.DATABASE_URL ?? "postgres://labelrep:labelrep@localhost:5432/labelrep";

const MAX_SOCKETS_PER_POST = 500;

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
  const retry = () => {
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

  const server = createServer((req, res) => {
    withClientIp(req);
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
  server.listen(port, hostname, () => {
    console.log(`> 라벨공화국 ready on http://${hostname}:${port} (${dev ? "dev" : "prod"})`);
  });
});
