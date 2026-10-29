import { json, route } from "@/lib/http";
import { dwellStats, kstDay, roomTabStats } from "@/lib/metrics";

// /api/admin/* 는 server.ts 에서 ADMIN_PASSWORD Basic 인증을 통과해야만 도달한다.
/** GET /api/admin/dwell?days=7&path=/c/...&tabs=1 — tabs=1 이면 📑 방 탭별 클릭 수도. ⏱ 페이지별 체류시간 중앙값·평균 스크롤·표시까지 간 비율 */
export const GET = route(async (req) => {
  const q = new URL(req.url).searchParams;
  const days = Math.min(90, Math.max(1, Number(q.get("days")) || 7));
  const to = kstDay();
  const from = kstDay(new Date(Date.now() - (days - 1) * 86400_000));
  const [rows, tabs] = await Promise.all([dwellStats(from, to, { path: q.get("path") ?? undefined, limit: 30 }), q.get("tabs") === "1" ? roomTabStats(from, to) : Promise.resolve(undefined)]);
  return json({ from, to, rows, ...(tabs ? { tabs } : {}) });
});
