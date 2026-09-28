import { NextResponse } from "next/server";
import { z } from "zod";
import { isConnectionError } from "./db";
import { HttpError } from "./errors";
import { reportError } from "./error-tracking";
import { firstIssue } from "./validation";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  // server.ts 의 CSRF 가드와 이중 방어: HTML 폼은 application/json 을 보낼 수 없다
  if (!/^application\/json\b/i.test(req.headers.get("content-type") ?? "")) {
    throw new HttpError(415, "unsupported_media_type", "요청 본문은 application/json 이어야 합니다.");
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "invalid_json", "요청 본문이 올바른 JSON이 아닙니다.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, "invalid_input", firstIssue(parsed.error));
  return parsed.data;
}

export const DB_UNAVAILABLE_MESSAGE = "지금은 서버 점검 중이라 읽기만 할 수 있어요. 잠시 뒤 다시 시도해 주세요.";

type Ctx<P> = { params: Promise<P> };

/** 라우트 핸들러 공통 에러 처리 */
export function route<P = Record<string, never>>(fn: (req: Request, params: P) => Promise<Response>) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      return await fn(req, await ctx.params);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: { code: err.code, message: err.message } }, err.status);
      // DB 장애 (Sprint 27): 서버 오류로 기록하지 않고 "잠시 읽기만 가능"으로 안내한다 — 글쓰기 화면은 임시저장(Sprint 19)이 남아 있어 다시 보내면 된다
      if (isConnectionError(err)) {
        return NextResponse.json(
          { error: { code: "db_unavailable", message: DB_UNAVAILABLE_MESSAGE } },
          { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } },
        );
      }
      console.error(err);
      reportError(err, { kind: "api", path: `${req.method} ${new URL(req.url).pathname}` });
      return json({ error: { code: "internal", message: "서버 오류가 발생했습니다." } }, 500);
    }
  };
}
