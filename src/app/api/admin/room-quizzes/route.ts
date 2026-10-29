import { z } from "zod";
import { json, parseBody, route } from "@/lib/http";
import { kstDay } from "@/lib/metrics";
import { listRoomQuizzes, putRoomQuiz, quizStats } from "@/lib/repo/roomQuizzes";

// /api/admin/* 는 server.ts 에서 ADMIN_PASSWORD Basic 인증을 통과해야만 도달한다.
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** GET /api/admin/room-quizzes?from=&to= — 넣어 둔 퀴즈 / ?stats=1&days=7 — 📊 방·날짜별 응답률 */
export const GET = route(async (req) => {
  const sp = new URL(req.url).searchParams;
  if (sp.get("stats") === "1") return json({ rows: await quizStats(Number(sp.get("days")) || 7) });
  const from = sp.get("from") ?? kstDay();
  const to = sp.get("to") ?? kstDay(new Date(Date.now() + 13 * 86400_000));
  return json({ items: await listRoomQuizzes(day.parse(from), day.parse(to)) });
});

const item = z.object({ room: z.string().min(1).max(60), day, quiz: z.unknown() });
const schema = z.union([item, z.object({ items: z.array(item).min(1).max(100) })]);

/** PUT /api/admin/room-quizzes {room, day, quiz} 또는 {items:[…]} — 날짜별로 넣기·고치기 (같은 방·날짜는 덮어씀) */
export const PUT = route(async (req) => {
  const input = await parseBody(req, schema);
  const items = "items" in input ? input.items : [input];
  const done: string[] = [];
  const errors: { room: string; day: string; error: string }[] = [];
  for (const it of items) {
    try {
      await putRoomQuiz(it.room, it.day, it.quiz);
      done.push(`${it.room}:${it.day}`);
    } catch (e) {
      errors.push({ room: it.room, day: it.day, error: (e as Error).message });
    }
  }
  return json({ saved: done.length, errors });
});
