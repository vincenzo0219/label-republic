import { z } from "zod";
import { json, parseBody, route } from "@/lib/http";
import { notFound } from "@/lib/errors";
import { clearPenalty } from "@/lib/repo/eventGoing";

// /api/admin/* 는 server.ts 에서 ADMIN_PASSWORD Basic 인증을 통과해야만 도달한다.
const schema = z.object({ id: z.string().regex(/^\d{1,18}$/, "번호를 확인하세요.") });

/** POST /api/admin/event-penalties {id}: 🙋 노쇼 기록 이의제기 받아들이기 (제한을 푼다) */
export const POST = route(async (req) => {
  const { id } = await parseBody(req, schema);
  if (!(await clearPenalty(id))) throw notFound("기록");
  return json({ ok: true });
});
