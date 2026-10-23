import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { ALL_HEADS, tabMembers } from "@/lib/heads";
import { json, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { filterCounts } from "@/lib/repo/categories";

const WEEK = 7 * 86_400_000;

/**
 * GET /api/rooms/filter-counts?slug=방&since=epochMs — 말머리·정보·정모 옆 숫자 (Sprint 93).
 * since 는 브라우저가 마지막으로 이 방을 본 시각 (처음 온 방이면 빼고 보내 최근 7일). 기록하지 않는다.
 */
export const GET = route(async (req) => {
  if (!(await hit(`filtercounts:${fingerprint(req.headers)}`, 60, 60 * 1000))) throw tooMany();
  const q = new URL(req.url).searchParams;
  const slug = q.get("slug") ?? "";
  if (!/^[\p{L}\p{N}-]{1,60}$/u.test(slug)) return json({ counts: {} });
  const ms = Number(q.get("since"));
  const floor = Date.now() - WEEK;
  const since = new Date(Number.isFinite(ms) && ms > floor ? ms : floor);
  const counts = await filterCounts(slug, since, ALL_HEADS.map((h) => h.key));
  // 합쳐진 탭 숫자는 그 안 말머리들을 더한다 (행사 = 행사 + 혜택)
  for (const h of ALL_HEADS) {
    const n = tabMembers(h.key).reduce((a, k) => a + (counts[k] ?? 0), 0);
    if (n > 0) counts[h.key] = Math.min(n, 99);
  }
  return json({ counts });
});
