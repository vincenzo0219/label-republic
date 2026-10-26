import { z } from "zod";
import { notFound } from "@/lib/errors";
import { json, parseBody, route } from "@/lib/http";
import { createSinglesEvent, listSinglesEvents, setSinglesEventHidden, singlesEventInput, updateSinglesEvent } from "@/lib/repo/singlesEvents";
import { todayKst } from "@/lib/singlesEvents";

// /api/admin/* 는 server.ts 에서 ADMIN_PASSWORD Basic 인증을 통과해야만 도달한다.
const id = z.string().regex(/^\d{1,18}$/);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), event: singlesEventInput }),
  z.object({ action: z.literal("update"), id, event: singlesEventInput }),
  z.object({ action: z.literal("hide"), id, hidden: z.boolean() }),
]);

/** GET /api/admin/singles-events: 💌 만남 행사 전체 (내린 것 포함, 끝난 지 30일 안) */
export const GET = route(async () => json({ events: await listSinglesEvents({ today: todayKst(), includeHidden: true, limit: 500 }) }));

/**
 * POST /api/admin/singles-events: 운영자가 원문 공지를 보고 한 건씩.
 * {action:"create", event} · {action:"update", id, event}(전체 교체) · {action:"hide", id, hidden}
 */
export const POST = route(async (req) => {
  const input = await parseBody(req, schema);
  if (input.action === "create") return json({ event: await createSinglesEvent(input.event) }, 201);
  if (input.action === "update") return json({ event: await updateSinglesEvent(input.id, input.event) });
  if (!(await setSinglesEventHidden(input.id, input.hidden))) throw notFound("행사");
  return json({ ok: true });
});
