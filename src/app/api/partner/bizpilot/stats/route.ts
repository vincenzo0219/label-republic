import { timingSafeEqual } from "node:crypto";
import { notFound } from "@/lib/errors";
import { json, route } from "@/lib/http";
import { shopStats } from "@/lib/repo/shopStats";

/**
 * GET /api/partner/bizpilot/stats?days=7 — 비즈파일럿이 가져가는 🏪 오늘도 장사중 주간 숫자 (읽기 전용).
 * 헤더 x-bizpilot-key 가 서버 .env 의 BIZPILOT_STATS_KEY 와 같아야 한다. 값이 없으면 이 주소는 없는 것처럼 404.
 */
export const GET = route(async (req) => {
  const secret = process.env.BIZPILOT_STATS_KEY;
  if (!secret || secret.length < 16) throw notFound("주소");
  const given = Buffer.from(req.headers.get("x-bizpilot-key") ?? "");
  const want = Buffer.from(secret);
  if (given.length !== want.length || !timingSafeEqual(given, want)) throw notFound("주소");
  const days = Math.min(31, Math.max(1, Math.floor(Number(new URL(req.url).searchParams.get("days")) || 7)));
  const stats = await shopStats(days);
  if (!stats) throw notFound("방");
  return json(stats);
});
