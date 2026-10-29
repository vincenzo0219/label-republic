import { z } from "zod";
import { json, parseBody, route } from "@/lib/http";
import { listKospiCloses, putKospiClose } from "@/lib/repo/kospi";

// /api/admin/* 는 server.ts 에서 ADMIN_PASSWORD Basic 인증을 통과해야만 도달한다.
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** GET /api/admin/kospi?limit=30 — 넣어 둔 코스피 종가 (최근 것부터, 전날 대비 move 1/-1/0, 그 날 고른 사람 수) */
export const GET = route(async (req) => {
  return json({ items: await listKospiCloses(Number(new URL(req.url).searchParams.get("limit")) || 30) });
});

const item = z.object({ day, close: z.number().positive() });
const schema = z.union([item, z.object({ items: z.array(item).min(1).max(60) })]);

/** PUT /api/admin/kospi {day, close} 또는 {items:[…]} — 📈 그 날 코스피 종가 넣기·고치기 → 결과·성적 다시 계산 */
export const PUT = route(async (req) => {
  const input = await parseBody(req, schema);
  const items = "items" in input ? input.items : [input];
  for (const it of items) await putKospiClose(it.day, it.close);
  return json({ saved: items.length, items: await listKospiCloses(10) });
});
