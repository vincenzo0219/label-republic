import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, route } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { newPostCounts } from "@/lib/repo/categories";

/**
 * GET /api/rooms/new-counts?s=slug:epochMs,slug:epochMs — 방 탭의 "새 글 N" (Sprint 41).
 * 마지막으로 본 시각은 브라우저에만 있고, 이 요청도 기록하지 않는다. 방당 최대 100까지만 센다.
 */
export const GET = route(async (req) => {
  if (!(await hit(`newcounts:${fingerprint(req.headers)}`, 60, 60 * 1000))) throw tooMany();
  const raw = new URL(req.url).searchParams.get("s") ?? "";
  const pairs: { slug: string; since: Date }[] = [];
  for (const part of raw.split(",").slice(0, 60)) {
    const i = part.lastIndexOf(":");
    const slug = decodeURIComponent(part.slice(0, i));
    const ms = Number(part.slice(i + 1));
    if (i > 0 && /^[\p{L}\p{N}-]{1,60}$/u.test(slug) && Number.isFinite(ms) && ms > 0) pairs.push({ slug, since: new Date(ms) });
  }
  return json({ counts: pairs.length ? await newPostCounts(pairs) : {} });
});
