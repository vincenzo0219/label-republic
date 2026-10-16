import { z } from "zod";
import { config } from "@/lib/config";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { newVisitorId, VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { hit } from "@/lib/rate-limit";
import { aiStats, saveAiResult } from "@/lib/repo/aiTest";

const schema = z.object({ mask: z.number().int().min(0).max(1023) });

/** GET /api/ai-test — 참가자 통계 (Sprint 68) */
export const GET = route(async () => json(await aiStats()));

/** POST /api/ai-test {mask} — 결과 저장 후 내 순위와 통계. 익명(방문자 쿠키 해시만). */
export const POST = route(async (req) => {
  if (!(await hit(`ai-test:${fingerprint(req.headers)}`, 20, 60 * 60 * 1000))) throw tooMany();
  const cookie = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];
  const vid = cookie ?? newVisitorId();
  const { mask } = await parseBody(req, schema);
  const score = await saveAiResult(visitorHash(vid), mask);
  const res = json({ score, ...(await aiStats(score)) });
  if (!cookie) {
    res.cookies.set(VISITOR_COOKIE, vid, { httpOnly: true, sameSite: "lax", secure: config.siteUrl.startsWith("https://"), maxAge: 60 * 60 * 24 * 365, path: "/" });
  }
  return res;
});
