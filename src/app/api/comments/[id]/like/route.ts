import { z } from "zod";
import { config } from "@/lib/config";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { newVisitorId, VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { hit } from "@/lib/rate-limit";
import { toggleLike } from "@/lib/repo/commentLikes";

const schema = z.object({ on: z.boolean() });

/** POST /api/comments/:id/like {on} — 👍 공감 (Sprint 78). 익명, 방문자 쿠키 해시당 한 번 */
export const POST = route<{ id: string }>(async (req, { id }) => {
  if (!(await hit(`comment:like:${fingerprint(req.headers)}`, 120, 3600_000))) throw tooMany();
  const cookie = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];
  const vid = cookie ?? newVisitorId();
  const { on } = await parseBody(req, schema);
  const res = json({ likes: await toggleLike(id, visitorHash(vid), on) });
  if (!cookie) res.cookies.set(VISITOR_COOKIE, vid, { httpOnly: true, sameSite: "lax", secure: config.siteUrl.startsWith("https://"), maxAge: 60 * 60 * 24 * 365, path: "/" });
  return res;
});
