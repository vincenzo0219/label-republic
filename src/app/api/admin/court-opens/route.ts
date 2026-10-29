import { z } from "zod";
import { json, parseBody, route } from "@/lib/http";
import { deleteCourtOpen, listCourtOpens, upsertCourtOpen } from "@/lib/repo/tennisAlerts";

// /api/admin/* 는 server.ts 에서 ADMIN_PASSWORD Basic 인증을 통과해야만 도달한다.
const courtSchema = z.object({
  id: z.number().int().positive().optional(),
  court: z.string().trim().min(2).max(60),
  sido: z.string().trim().min(2).max(10),
  sigungu: z.string().trim().max(20).default(""),
  open_days: z.array(z.number().int().min(1).max(31)).min(1).max(10),
  open_time: z.string().regex(/^(\d{2}:\d{2})?$/).default(""),
  booking_url: z.string().url().max(300),
  source_url: z.string().url().max(300),
  note: z.string().trim().max(200).default(""),
  last_verified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  active: z.boolean().default(true),
});

/** GET /api/admin/court-opens — 🎾 코트 예약 오픈 규칙 전부 (꺼 둔 것까지) */
export const GET = route(async () => json({ courts: await listCourtOpens({ all: true }) }));

/** PUT /api/admin/court-opens {id?, court, sido, sigungu?, open_days[], open_time?, booking_url, source_url, note?, last_verified, active?} — 넣기·고치기 */
export const PUT = route(async (req) => json({ court: await upsertCourtOpen(await parseBody(req, courtSchema)) }));

/** DELETE /api/admin/court-opens {id} */
export const DELETE = route(async (req) => {
  const { id } = await parseBody(req, z.object({ id: z.number().int().positive() }));
  await deleteCourtOpen(id);
  return json({ ok: true });
});
