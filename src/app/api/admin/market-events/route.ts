import { z } from "zod";
import { notFound } from "@/lib/errors";
import { json, parseBody, route } from "@/lib/http";
import { addEvent, deleteEvent, listEvents } from "@/lib/repo/marketEvents";

// /api/admin/* 는 server.ts 에서 ADMIN_PASSWORD Basic 인증을 통과해야만 도달한다.
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    market: z.enum(["us", "kr"]),
    /** 시각 (ISO 8601, 시간대 포함 — 예: 2026-11-19T16:20:00-05:00) */
    startsAt: z.string().refine((v) => /[zZ]|[+-]\d{2}:\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)), "시간대가 붙은 ISO 시각이어야 해요."),
    title: z.string().trim().min(2).max(60),
    sourceUrl: z.string().trim().url().max(500),
  }),
  z.object({ action: z.literal("delete"), id: z.string().regex(/^\d{1,18}$/) }),
]);

/** GET /api/admin/market-events — 오늘(어제 0시 UTC)부터의 일정 */
export const GET = route(async () => json({ events: await listEvents(new Date(Date.now() - 86_400_000)) }));

/** POST /api/admin/market-events — 일정 넣기(add) · 지우기(delete). 📅 오늘 밤 미국장 카드에 바로 보인다 */
export const POST = route(async (req) => {
  const input = await parseBody(req, schema);
  if (input.action === "add") return json({ event: await addEvent(input) }, 201);
  if (!(await deleteEvent(input.id))) throw notFound("일정");
  return json({ ok: true });
});
