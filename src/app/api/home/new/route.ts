import { json, route } from "@/lib/http";
import { kstDay } from "@/lib/metrics";
import { neoVisitor } from "@/lib/neoVisitor";
import { homeHasNew } from "@/lib/repo/neo";

/** GET /api/home/new?since=<ms> — 🔴 로고 옆 점: 마지막으로 첫 화면을 본 뒤 새로 생긴 게 있는지 (since 가 없으면 있다고 본다) */
export const GET = route(async (req) => {
  const raw = Number(new URL(req.url).searchParams.get("since"));
  if (!Number.isFinite(raw) || raw <= 0) return json({ dot: true });
  const todayStart = Date.parse(`${kstDay()}T00:00:00+09:00`);
  return json({ dot: await homeHasNew(new Date(raw), neoVisitor(req).hash, todayStart) });
});
