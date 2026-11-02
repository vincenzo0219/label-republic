import { z } from "zod";
import { config } from "@/lib/config";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { kstDay, newVisitorId, VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { hit } from "@/lib/rate-limit";
import { pickSentence, sentenceCard } from "@/lib/repo/sentencePick";

const cookieOf = (req: Request) => req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];

/** GET /api/sentence-pick — 오늘의 문장 두 개 (고른 뒤에는 비율과 취향) */
export const GET = route(async (req) => {
  const vid = cookieOf(req);
  return json(await sentenceCard(kstDay(), vid ? visitorHash(vid) : null));
});

const schema = z.object({ choice: z.union([z.literal(0), z.literal(1)]) });

/** POST /api/sentence-pick {choice: 0|1} — 하루 한 번 */
export const POST = route(async (req) => {
  if (!(await hit(`sentence:pick:${fingerprint(req.headers)}`, 30, 3600_000))) throw tooMany();
  const cookie = cookieOf(req);
  const vid = cookie ?? newVisitorId();
  const { choice } = await parseBody(req, schema);
  const res = json(await pickSentence(kstDay(), visitorHash(vid), choice));
  if (!cookie) res.cookies.set(VISITOR_COOKIE, vid, { httpOnly: true, sameSite: "lax", secure: config.siteUrl.startsWith("https://"), maxAge: 60 * 60 * 24 * 365, path: "/" });
  return res;
});
