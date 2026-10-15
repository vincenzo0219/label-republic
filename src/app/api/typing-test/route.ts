import { z } from "zod";
import { config } from "@/lib/config";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { newVisitorId, VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { hit } from "@/lib/rate-limit";
import { saveTypingResult, typingStats } from "@/lib/repo/typingTest";
import { TYPING_MAX_CPM } from "@/lib/typingTest";

const device = z.enum(["pc", "mobile"]);
const schema = z.object({ cpm: z.number().int().min(0).max(TYPING_MAX_CPM), accuracy: z.number().int().min(0).max(100), device });

/** GET /api/typing-test?device=pc|mobile — 참가자 통계 (Sprint 67) */
export const GET = route(async (req) => {
  const d = device.catch("pc").parse(new URL(req.url).searchParams.get("device"));
  return json({ device: d, ...(await typingStats(d)) });
});

/** POST /api/typing-test {cpm, accuracy, device} — 결과 저장 후 같은 기기 종류 안의 순위와 통계. 익명(방문자 쿠키 해시만). */
export const POST = route(async (req) => {
  if (!(await hit(`typing:${fingerprint(req.headers)}`, 20, 60 * 60 * 1000))) throw tooMany();
  const cookie = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];
  const vid = cookie ?? newVisitorId();
  const input = await parseBody(req, schema);
  await saveTypingResult(visitorHash(vid), input.cpm, input.accuracy, input.device);
  const res = json({ ...input, ...(await typingStats(input.device, input.cpm)) });
  if (!cookie) {
    res.cookies.set(VISITOR_COOKIE, vid, { httpOnly: true, sameSite: "lax", secure: config.siteUrl.startsWith("https://"), maxAge: 60 * 60 * 24 * 365, path: "/" });
  }
  return res;
});
