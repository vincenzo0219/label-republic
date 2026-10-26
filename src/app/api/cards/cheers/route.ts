import { json, route } from "@/lib/http";
import { cheerCounts } from "@/lib/repo/cards";

/** GET /api/cards/cheers?ids=1,2 — 🎉 축하 수 (내 기념일 카드: 이 기기에서 올린 카드, 최대 20개) */
export const GET = route(async (req) => {
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter((x) => /^\d{1,18}$/.test(x)).slice(0, 20);
  return json({ cheers: await cheerCounts(ids) });
});
