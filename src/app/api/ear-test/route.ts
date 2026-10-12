import { z } from "zod";
import { config } from "@/lib/config";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { newVisitorId, VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { hit } from "@/lib/rate-limit";
import { earStats, saveEarResult } from "@/lib/repo/earTest";

const schema = z.object({ mask: z.number().int().min(0).max(1023) });

/** GET /api/ear-test — 참가자 통계 (Sprint 59) */
export const GET = route(async () => json(await earStats()));

/**
 * POST /api/ear-test {mask} — 결과 저장 후 내 순위와 통계. 익명(방문자 쿠키 해시만).
 * 방문자 쿠키가 아직 없으면(조회 비콘보다 먼저 끝낸 경우 등) 여기서 발급한다 — 결과를 버리지 않게.
 */
export const POST = route(async (req) => {
  if (!(await hit(`ear:${fingerprint(req.headers)}`, 20, 60 * 60 * 1000))) throw tooMany();
  const cookie = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];
  const vid = cookie ?? newVisitorId();
  const { mask } = await parseBody(req, schema);
  const score = await saveEarResult(visitorHash(vid), mask);
  const res = json({ score, ...(await earStats(score)) });
  if (!cookie) {
    res.cookies.set(VISITOR_COOKIE, vid, { httpOnly: true, sameSite: "lax", secure: config.siteUrl.startsWith("https://"), maxAge: 60 * 60 * 24 * 365, path: "/" });
  }
  return res;
});
