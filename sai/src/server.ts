import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ClaudeBrain } from "./claude.js";
import { DemoBrain } from "./demo.js";
import { Engine, SaiError } from "./engine.js";
import type { Channel, Room } from "./types.js";

const PORT = Number(process.env.PORT ?? 3300);
const DATA_DIR = fileURLToPath(new URL("../data/", import.meta.url));
const DATA_FILE = `${DATA_DIR}rooms.json`;
const INDEX_HTML = fileURLToPath(new URL("../public/index.html", import.meta.url));

// ---------- 저장: 프로토타입이라 DB 없이 JSON 파일 하나 ----------
let saveTimer: NodeJS.Timeout | null = null;
function scheduleSave(rooms: Room[]) {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(`${DATA_FILE}.tmp`, JSON.stringify(rooms));
    renameSync(`${DATA_FILE}.tmp`, DATA_FILE);
  }, 500);
}

const demo = process.env.SAI_DEMO === "1" || !process.env.ANTHROPIC_API_KEY;
const engine = new Engine(demo ? new DemoBrain() : new ClaudeBrain(), scheduleSave);
if (existsSync(DATA_FILE)) engine.load(JSON.parse(readFileSync(DATA_FILE, "utf8")) as Room[]);

// ---------- HTTP ----------
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64_000) throw new SaiError(413, "너무 길어요.");
  }
  try {
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    throw new SaiError(400, "요청 형식이 올바르지 않아요.");
  }
}

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://local");
  const path = url.pathname;

  if (req.method === "GET" && (path === "/" || path.startsWith("/r/"))) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(readFileSync(INDEX_HTML));
    return;
  }

  if (req.method === "POST" && path === "/api/rooms") {
    const b = await body(req);
    return json(res, 200, engine.createRoom(str(b.name)));
  }

  const m = path.match(/^\/api\/rooms\/([\w-]+)\/(join|state|events|messages|joint|report)$/);
  if (!m) return json(res, 404, { error: "없는 주소예요." });
  const [, roomId, action] = m;

  if (req.method === "GET" && action === "state") {
    return json(res, 200, engine.view(roomId, str(url.searchParams.get("token"))));
  }

  if (req.method === "GET" && action === "events") {
    const tok = str(url.searchParams.get("token"));
    engine.view(roomId, tok); // 권한 확인
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
    });
    const send = () => {
      try {
        res.write(`data: ${JSON.stringify(engine.view(roomId, tok))}\n\n`);
      } catch {
        /* 방이 사라지면 무시 */
      }
    };
    send();
    const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
    engine.events.on(roomId, send);
    req.on("close", () => {
      clearInterval(ping);
      engine.events.off(roomId, send);
    });
    return;
  }

  if (req.method !== "POST") return json(res, 405, { error: "허용되지 않은 요청이에요." });
  const b = await body(req);
  const tok = str(b.token);

  switch (action) {
    case "join":
      return json(res, 200, engine.join(roomId, str(b.invite), str(b.name)));
    case "messages": {
      const channel = str(b.channel) as Channel;
      if (!["privA", "privB", "joint"].includes(channel)) throw new SaiError(400, "방 종류가 올바르지 않아요.");
      // 상담사 응답은 SSE로 도착하므로 기다리지 않고 바로 돌려준다. 입력 오류는 먼저 검사한다.
      const pending = engine.post(roomId, tok, channel, str(b.text));
      await Promise.race([pending, new Promise((r) => setTimeout(r, 50))]);
      pending.catch(() => {});
      return json(res, 200, { ok: true });
    }
    case "joint": {
      const pending = engine.requestJoint(roomId, tok);
      await Promise.race([pending, new Promise((r) => setTimeout(r, 50))]);
      pending.catch(() => {});
      return json(res, 200, engine.view(roomId, tok));
    }
    case "report":
      return json(res, 200, { report: await engine.makeReport(roomId, tok) });
  }
}

createServer((req, res) => {
  route(req, res).catch((err: unknown) => {
    if (err instanceof SaiError) return json(res, err.status, { error: err.message });
    console.error(err);
    json(res, 500, { error: "잠시 문제가 생겼어요." });
  });
}).listen(PORT, () => {
  console.log(`사이 상담방: http://localhost:${PORT}`);
  if (demo) console.warn("데모 모드: 상담사가 정해진 말만 합니다. 실제 상담은 ANTHROPIC_API_KEY 를 넣고 다시 켜세요.");
});
