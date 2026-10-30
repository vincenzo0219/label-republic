/** ⚽ 승부차기 API 공용: 방문자 쿠키(lr_vid) 읽기·심기 */
import type { NextResponse } from "next/server";
import { config } from "./config";
import { newVisitorId, VISITOR_COOKIE, visitorHash } from "./metrics";

export const cookieOf = (req: Request) => req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];

/** 쿠키가 없으면 새로 만든다 (응답에 심는 것은 withVisitor) */
export function visitorOf(req: Request): { vid: string; fresh: boolean; hash: string } {
  const cookie = cookieOf(req);
  const vid = cookie ?? newVisitorId();
  return { vid, fresh: !cookie, hash: visitorHash(vid) };
}

export function withVisitor<T extends NextResponse>(res: T, v: { vid: string; fresh: boolean }): T {
  if (v.fresh) res.cookies.set(VISITOR_COOKIE, v.vid, { httpOnly: true, sameSite: "lax", secure: config.siteUrl.startsWith("https://"), maxAge: 60 * 60 * 24 * 365, path: "/" });
  return res;
}
