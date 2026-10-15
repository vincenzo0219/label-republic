import { z } from "zod";
import { config } from "@/lib/config";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { kstDay, newVisitorId, VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { hit } from "@/lib/rate-limit";
import { dailyStats, saveDailyAnswer } from "@/lib/repo/daily";

const schema = z.object({ kind: z.enum(["line", "ear"]), correct: z.boolean() });

/** GET /api/daily — 오늘 문제의 참가자 수·정답률 (Sprint 66) */
export const GET = route(async () => json(await dailyStats(kstDay())));

/** POST /api/daily {kind, correct} — 오늘 답 저장 후 오늘 통계. 익명(방문자 쿠키 해시만), 날짜는 서버가 정한다. */
export const POST = route(async (req) => {
  if (!(await hit(`daily:${fingerprint(req.headers)}`, 30, 60 * 60 * 1000))) throw tooMany();
  const cookie = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];
  const vid = cookie ?? newVisitorId();
  const { kind, correct } = await parseBody(req, schema);
  const day = kstDay();
  await saveDailyAnswer(day, visitorHash(vid), kind, correct);
  const res = json(await dailyStats(day));
  if (!cookie) {
    res.cookies.set(VISITOR_COOKIE, vid, { httpOnly: true, sameSite: "lax", secure: config.siteUrl.startsWith("https://"), maxAge: 60 * 60 * 24 * 365, path: "/" });
  }
  return res;
});
