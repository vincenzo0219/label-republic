import { json, route } from "@/lib/http";
import { dwellStats, kstDay } from "@/lib/metrics";

// /api/admin/* 는 server.ts 에서 ADMIN_PASSWORD Basic 인증을 통과해야만 도달한다.
/** GET /api/admin/dwell?days=7&path=/c/... — ⏱ 페이지별 체류시간 중앙값·평균 스크롤·표시까지 간 비율 */
export const GET = route(async (req) => {
  const q = new URL(req.url).searchParams;
  const days = Math.min(90, Math.max(1, Number(q.get("days")) || 7));
  const to = kstDay();
  const from = kstDay(new Date(Date.now() - (days - 1) * 86400_000));
  return json({ from, to, rows: await dwellStats(from, to, { path: q.get("path") ?? undefined, limit: 30 }) });
});
