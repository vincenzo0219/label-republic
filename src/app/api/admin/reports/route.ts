import { json, route } from "@/lib/http";
import { operatorReports } from "@/lib/repo/reports";

// /api/admin/* 는 server.ts 에서 ADMIN_PASSWORD Basic 인증을 통과해야만 도달한다.

/** GET /api/admin/reports?days=7 — 🚩 신고 들어온 것 (모든 방·모든 종류, 최근 신고 순). 신고는 가리지 않고 여기로 온다 (10/29). priority: 신고 수가 규칙 값 이상 */
export const GET = route(async (req) => {
  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 7));
  return json({ items: await operatorReports(days, 200) });
});
