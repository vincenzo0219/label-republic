import { z } from "zod";
import { config } from "@/lib/config";
import { HttpError, tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { newVisitorId, VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { validRallyScore, validSeed } from "@/lib/rallyChallenge";
import { hit } from "@/lib/rate-limit";
import { createChallenge } from "@/lib/repo/rallyChallenges";

const cookieOf = (req: Request) => req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];
const schema = z.object({ score: z.number(), seed: z.number(), name: z.string().max(40).nullish(), parent: z.string().max(12).nullish() });

/** POST /api/rally/challenges {score, seed, name?, parent?} — 🎾 도전장 만들기 (10/30). 한 사람 한 시간에 20장까지 */
export const POST = route(async (req) => {
  if (!(await hit(`rally:challenge:${fingerprint(req.headers)}`, 20, 3600_000))) throw tooMany();
  const { score, seed, name, parent } = await parseBody(req, schema);
  if (!validRallyScore(score) || !validSeed(seed)) throw new HttpError(400, "bad_challenge", "도전장을 만들지 못했어요");
  const cookie = cookieOf(req);
  const vid = cookie ?? newVisitorId();
  const res = json(await createChallenge({ visitor: visitorHash(vid), score, seed, name, parent }));
  if (!cookie) res.cookies.set(VISITOR_COOKIE, vid, { httpOnly: true, sameSite: "lax", secure: config.siteUrl.startsWith("https://"), maxAge: 60 * 60 * 24 * 365, path: "/" });
  return res;
});
