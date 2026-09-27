import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError } from "./errors";
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

type Ctx<P> = { params: Promise<P> };

/** 라우트 핸들러 공통 에러 처리 */
export function route<P = Record<string, never>>(fn: (req: Request, params: P) => Promise<Response>) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      return await fn(req, await ctx.params);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: { code: err.code, message: err.message } }, err.status);
      console.error(err);
      return json({ error: { code: "internal", message: "서버 오류가 발생했습니다." } }, 500);
    }
  };
}
