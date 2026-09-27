import { NextResponse } from "next/server";
import { z } from "zod";
import { config } from "@/lib/config";
import { classifySource, isBot, newVisitorId, parsePath, recordPageView, VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { hit } from "@/lib/rate-limit";

const bodySchema = z.object({
  path: z.string().max(600),
  referrer: z.string().max(1000).optional(),
  landing: z.boolean(),
});

/**
 * POST /api/metrics/pageview — 클라이언트 비콘 (navigator.sendBeacon)
 * 응답 본문은 없고, 방문자 쿠키가 없으면 새로 발급한다. 수집 실패가 사용자 경험을 막지 않도록 항상 204.
 */
export async function POST(req: Request) {
  const res = new NextResponse(null, { status: 204 });
  try {
    if (isBot(req.headers.get("user-agent"))) return res;
    const parsed = bodySchema.safeParse(JSON.parse(await req.text()));
    if (!parsed.success) return res;
    const path = parsePath(parsed.data.path);
    if (!path) return res;

    const cookie = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];
    const vid = cookie ?? newVisitorId();
    if (!cookie) {
      res.cookies.set(VISITOR_COOKIE, vid, {
        httpOnly: true,
        sameSite: "lax",
        secure: config.siteUrl.startsWith("https://"),
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
      });
    }
    const vh = visitorHash(vid);
    if (!(await hit(`pv:${vh}`, 120, 60 * 1000))) return res;

    const { source, host } = classifySource({
      landing: parsed.data.landing,
      referrer: parsed.data.referrer,
      siteHost: new URL(config.siteUrl).hostname, // 레퍼러도 hostname(포트 제외)으로 비교한다
    });
    await recordPageView({ visitorHash: vh, path, source, referrerHost: host, landing: parsed.data.landing });
  } catch (err) {
    console.error("[metrics]", (err as Error).message);
  }
  return res;
}
