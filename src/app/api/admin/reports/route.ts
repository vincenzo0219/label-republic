import { json, route } from "@/lib/http";
import { listAutoHidden, listDuplicates, operatorReports } from "@/lib/repo/reports";

// /api/admin/* 는 server.ts 에서 ADMIN_PASSWORD Basic 인증을 통과해야만 도달한다.

/**
 * GET /api/admin/reports?days=7&dupDays=1 — 운영자 점검용 한 번에 (10/29)
 * - items: 🚩 신고 들어온 것 (신고는 가리지 않고 여기로). priority: 신고 수가 규칙 값 이상
 * - autoHidden: 🧹 올린 직후 조롱·도배로 바로 가린 것(troll, 쓴 사람에게만 보임)과 운영자가 가린 것(operator)
 * - duplicates: 🔁 똑같은 글을 여러 번 올린 것 (보고만)
 */
export const GET = route(async (req) => {
  const sp = new URL(req.url).searchParams;
  const days = Math.min(90, Math.max(1, Number(sp.get("days")) || 7));
  const dupDays = Math.min(30, Math.max(1, Number(sp.get("dupDays")) || 1));
  const [items, autoHidden, duplicates] = await Promise.all([operatorReports(days, 200), listAutoHidden(days, 200), listDuplicates(dupDays, 100)]);
  return json({ items, autoHidden, duplicates });
});
