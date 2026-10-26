import { config } from "@/lib/config";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, route } from "@/lib/http";
import { newVisitorId, VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { hit } from "@/lib/rate-limit";
import { cheerCard } from "@/lib/repo/cards";

/** POST /api/cards/:id/cheer — 🎉 축하해요 · 💪 응원해요 (10/26). 익명, 방문자 쿠키 해시당 한 번 (👍 공감과 같은 방식, 취소 없음) */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const fp = fingerprint(req.headers);
  if (!(await hit(`card:cheer:${fp}`, 120, 3600_000))) throw tooMany();
  const cookie = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];
  const vid = cookie ?? newVisitorId();
  const res = json({ cheers: await cheerCard(id, visitorHash(vid), fp) });
  if (!cookie) res.cookies.set(VISITOR_COOKIE, vid, { httpOnly: true, sameSite: "lax", secure: config.siteUrl.startsWith("https://"), maxAge: 60 * 60 * 24 * 365, path: "/" });
  return res;
});
