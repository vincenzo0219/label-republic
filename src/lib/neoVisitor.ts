/** 💳 넣어둬: 가입 없이 방문자 쿠키로 글쓴이·투표자를 알아본다 (debate 투표와 같은 쿠키) */
import type { NextResponse } from "next/server";
import { config } from "./config";
import { newVisitorId, VISITOR_COOKIE, visitorHash } from "./metrics";

export function neoVisitor(req: Request): { hash: string; fresh: string | null } {
  const cookie = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];
  const vid = cookie ?? newVisitorId();
  return { hash: visitorHash(vid), fresh: cookie ? null : vid };
}

/** 쿠키가 없던 방문자에게 새 쿠키를 붙인다 */
export function withVisitor(res: NextResponse, fresh: string | null): NextResponse {
  if (fresh) res.cookies.set(VISITOR_COOKIE, fresh, { httpOnly: true, sameSite: "lax", secure: config.siteUrl.startsWith("https://"), maxAge: 60 * 60 * 24 * 365, path: "/" });
  return res;
}
