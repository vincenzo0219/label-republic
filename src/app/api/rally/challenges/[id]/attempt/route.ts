import { z } from "zod";
import { config } from "@/lib/config";
import { HttpError, tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { newVisitorId, VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { validRallyScore } from "@/lib/rallyChallenge";
import { hit } from "@/lib/rate-limit";
import { recordAttempt } from "@/lib/repo/rallyChallenges";

const cookieOf = (req: Request) => req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];
const schema = z.object({ score: z.number() });

/** POST /api/rally/challenges/:id/attempt {score} — 🎾 도전 한 판. 결과(넘었나)는 서버가 정한다 */
export const POST = route<{ id: string }>(async (req, { id }) => {
  if (!(await hit(`rally:attempt:${fingerprint(req.headers)}`, 120, 3600_000))) throw tooMany();
  const { score } = await parseBody(req, schema);
  if (!validRallyScore(score)) throw new HttpError(400, "bad_score", "기록을 저장하지 못했어요");
  const cookie = cookieOf(req);
  const vid = cookie ?? newVisitorId();
  const r = await recordAttempt(id, visitorHash(vid), score);
  if (!r) throw new HttpError(404, "no_challenge", "도전장을 찾지 못했어요");
  const res = json(r);
  if (!cookie) res.cookies.set(VISITOR_COOKIE, vid, { httpOnly: true, sameSite: "lax", secure: config.siteUrl.startsWith("https://"), maxAge: 60 * 60 * 24 * 365, path: "/" });
  return res;
});
