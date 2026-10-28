import { json, route } from "@/lib/http";
import { neoVisitor } from "@/lib/neoVisitor";
import { neoNewCount } from "@/lib/repo/neo";

/** GET /api/neo/new?since=<ms> — 💳 넣어둬 버튼의 새 글 수 (since 가 없으면 최근 24시간) */
export const GET = route(async (req) => {
  const raw = Number(new URL(req.url).searchParams.get("since"));
  const since = Number.isFinite(raw) && raw > 0 ? new Date(raw) : new Date(Date.now() - 86400_000);
  const count = await neoNewCount(since, neoVisitor(req).hash);
  return json({ count });
});
