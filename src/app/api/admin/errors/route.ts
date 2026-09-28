import { z } from "zod";
import { json, parseBody, route } from "@/lib/http";
import { resolveError } from "@/lib/repo/metrics";

// /api/admin/* 는 server.ts 에서 ADMIN_PASSWORD Basic 인증을 통과해야만 도달한다.
const schema = z.object({ id: z.string().regex(/^\d{1,18}$/) });

/** POST /api/admin/errors {id} — 서버 오류 해결 표시 (내부 기록, 공개하지 않음) */
export const POST = route(async (req) => {
  const { id } = await parseBody(req, schema);
  await resolveError(id);
  return json({ ok: true });
});
