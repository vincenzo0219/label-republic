import { NextResponse } from "next/server";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { route } from "@/lib/http";
import { handleRpc } from "@/lib/mcp";
import { hit } from "@/lib/rate-limit";

/** POST /api/mcp — MCP (Streamable HTTP, JSON 응답). 단일 메시지 또는 배열 (Sprint 75) */
export const POST = route(async (req) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`mcp:${fp}`, 120, 3600_000))) throw tooMany();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }
  const msgs = (Array.isArray(body) ? body : [body]).slice(0, 20);
  // ?src=playmcp (카카오 PlayMCP): 읽기 전용 도구만 보이고, 쓰기 도구 호출은 거절
  const readOnly = new URL(req.url).searchParams.get("src") === "playmcp";
  const out = (await Promise.all(msgs.map((m) => handleRpc(m, fp, { readOnly })))).filter((r) => r !== null);
  if (out.length === 0) return new NextResponse(null, { status: 202 });
  return NextResponse.json(Array.isArray(body) ? out : out[0], { headers: { "Cache-Control": "no-store" } });
});

/** 서버→클라이언트 스트림은 쓰지 않는다 */
export const GET = () => new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
export const DELETE = GET;
