import { z } from "zod";
import { config } from "@/lib/config";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { newVisitorId, VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { hit } from "@/lib/rate-limit";
import { voteDebate } from "@/lib/repo/debateVotes";

const schema = z.object({ postId: z.string().regex(/^\d{1,18}$/), side: z.enum(["A", "B"]) });

/** POST /api/debate/vote {postId, side} — 사람 한 표 (Sprint 74). 익명, 방문자 쿠키 해시당 한 표 */
export const POST = route(async (req) => {
  if (!(await hit(`debate:vote:${fingerprint(req.headers)}`, 30, 3600_000))) throw tooMany();
  const cookie = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];
  const vid = cookie ?? newVisitorId();
  const { postId, side } = await parseBody(req, schema);
  const res = json(await voteDebate(postId, visitorHash(vid), side));
  if (!cookie) res.cookies.set(VISITOR_COOKIE, vid, { httpOnly: true, sameSite: "lax", secure: config.siteUrl.startsWith("https://"), maxAge: 60 * 60 * 24 * 365, path: "/" });
  return res;
});
