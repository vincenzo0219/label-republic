import { z } from "zod";
import { isBot, parsePath, recordDwell, VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { hit } from "@/lib/rate-limit";

const bodySchema = z.object({
  path: z.string().max(600),
  ms: z.number().int().min(0).max(6 * 3600_000),
  scroll: z.number().int().min(0).max(100),
  marks: z.array(z.string().regex(/^[a-z0-9-]{1,30}$/)).max(10).default([]),
});

/** POST /api/metrics/dwell — ⏱ 페이지를 떠날 때 비콘 (머문 시간·스크롤 깊이). 방문자 쿠키가 있을 때만, 항상 204 */
export async function POST(req: Request) {
  const res = new Response(null, { status: 204 });
  try {
    if (isBot(req.headers.get("user-agent"))) return res;
    const vid = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];
    if (!vid) return res;
    const parsed = bodySchema.safeParse(JSON.parse(await req.text()));
    if (!parsed.success) return res;
    const path = parsePath(parsed.data.path);
    if (!path) return res;
    const vh = visitorHash(vid);
    if (!(await hit(`dwell:${vh}`, 120, 60 * 1000))) return res;
    // 0.5초도 안 된 것(바로 다른 페이지로 넘어감)은 버린다
    if (parsed.data.ms < 500) return res;
    await recordDwell({ visitorHash: vh, path: path.path, categorySlug: path.categorySlug, ms: parsed.data.ms, scrollPct: parsed.data.scroll, marks: parsed.data.marks });
  } catch {}
  return res;
}
