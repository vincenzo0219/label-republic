import { json, route } from "@/lib/http";
import { kstDay, roomRevisitStats } from "@/lib/metrics";

// /api/admin/* 는 server.ts 에서 ADMIN_PASSWORD Basic 인증을 통과해야만 도달한다.
/** GET /api/admin/room-revisit?days=14 — 📊 방별 재방문율 (2일 이상 온 비율, 첫 방문 7일 안 재방문) */
export const GET = route(async (req) => {
  const days = Math.min(60, Math.max(2, Number(new URL(req.url).searchParams.get("days")) || 14));
  const to = kstDay();
  const from = kstDay(new Date(Date.now() - (days - 1) * 86400_000));
  return json({ from, to, rooms: await roomRevisitStats(from, to) });
});
