import { z } from "zod";
import { json, parseBody, route } from "@/lib/http";
import { createCheerCard } from "@/lib/repo/cards";

// /api/admin/* 는 server.ts 에서 ADMIN_PASSWORD Basic 인증을 통과해야만 도달한다.
const schema = z.object({
  room: z.string().min(1).max(60),
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().max(2000).optional(),
});

/**
 * POST /api/admin/cheer-cards {room, title, body?} — 💪 모두의 응원 카드 (10/26). 예: "💪 오늘 춘천마라톤 뛰는 분들 응원해요".
 * 카드에는 💪 응원해요 버튼과 수가 붙는다. 운영자는 누르지 않는다.
 */
export const POST = route(async (req) => {
  const input = await parseBody(req, schema);
  return json({ card: await createCheerCard(input) }, 201);
});
