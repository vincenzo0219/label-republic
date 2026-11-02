import { z } from "zod";
import { json, parseBody, route } from "@/lib/http";
import { notFound } from "@/lib/errors";
import { createPrediction, deletePrediction, listPredictions, resolvePrediction } from "@/lib/repo/predictions";

// /api/admin/* 는 server.ts 에서 ADMIN_PASSWORD Basic 인증을 통과해야만 도달한다.
/** GET /api/admin/predictions?limit=50 — 결과 안 넣은 문제 먼저 */
export const GET = route(async (req) => {
  const limit = Number(new URL(req.url).searchParams.get("limit")) || 50;
  return json({ items: await listPredictions(limit) });
});

const id = z.string().regex(/^\d{1,18}$/);
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    room: z.string().min(1).max(60),
    title: z.string().min(1).max(120),
    options: z.array(z.string().min(1).max(30)).min(2).max(6),
    closesAt: z.string().min(10).max(40),
    points: z.number().int().min(1).max(100).optional(),
    seedKey: z.string().min(1).max(120).optional(),
    sourceUrl: z.string().url().max(500).optional(),
  }),
  z.object({ action: z.literal("resolve"), id, answer: z.number().int().min(0).max(5), sourceUrl: z.string().url().max(500).optional() }),
  z.object({ action: z.literal("delete"), id }),
]);

/** POST /api/admin/predictions {action: create|resolve|delete} — 🎯 승부 예측 문제 넣기·결과 넣기 (11/2) */
export const POST = route(async (req) => {
  const input = await parseBody(req, schema);
  if (input.action === "create") {
    const { action: _a, ...rest } = input;
    return json({ item: await createPrediction(rest) });
  }
  if (input.action === "resolve") return json({ item: await resolvePrediction(input.id, input.answer, input.sourceUrl) });
  if (!(await deletePrediction(input.id))) throw notFound("예측 문제");
  return json({ ok: true });
});
