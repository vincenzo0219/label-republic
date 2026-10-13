import { z } from "zod";
import { config } from "@/lib/config";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { HEARING_STEPS } from "@/lib/hearingTest";
import { json, parseBody, route } from "@/lib/http";
import { newVisitorId, VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { hit } from "@/lib/rate-limit";
import { hearingStats, saveHearingResult } from "@/lib/repo/hearingTest";

const schema = z.object({
  maxKhz: z.number().int().refine((k) => k === 0 || HEARING_STEPS.includes(k), "maxKhz 는 0 또는 단계 주파수여야 합니다."),
});

/** GET /api/hearing-test — 참가자 통계 (Sprint 61) */
export const GET = route(async () => json(await hearingStats()));

/** POST /api/hearing-test {maxKhz} — 결과 저장 후 내 순위와 통계. 익명(방문자 쿠키 해시만). 황금귀 테스트와 같은 방식. */
export const POST = route(async (req) => {
  if (!(await hit(`hearing:${fingerprint(req.headers)}`, 20, 60 * 60 * 1000))) throw tooMany();
  const cookie = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];
  const vid = cookie ?? newVisitorId();
  const { maxKhz } = await parseBody(req, schema);
  await saveHearingResult(visitorHash(vid), maxKhz);
  const res = json({ maxKhz, ...(await hearingStats(maxKhz)) });
  if (!cookie) {
    res.cookies.set(VISITOR_COOKIE, vid, { httpOnly: true, sameSite: "lax", secure: config.siteUrl.startsWith("https://"), maxAge: 60 * 60 * 24 * 365, path: "/" });
  }
  return res;
});
