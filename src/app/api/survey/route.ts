import { z } from "zod";
import { config } from "@/lib/config";
import { HttpError, tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { hit } from "@/lib/rate-limit";
import { PMF_COOKIE, submitSurvey } from "@/lib/repo/survey";

const schema = z.object({
  answer: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  comment: z.string().max(300).optional(),
});

/** POST /api/survey {answer, comment?} — "노방장이 없어진다면?" (Sprint 40). 방문자 쿠키로 한 사람 한 번 */
export const POST = route(async (req) => {
  if (!(await hit(`survey:${fingerprint(req.headers)}`, 5, 60 * 60 * 1000))) throw tooMany();
  const vid = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];
  if (!vid) throw new HttpError(400, "no_visitor", "방문 기록이 없어 응답을 받을 수 없어요.");
  const { answer, comment } = await parseBody(req, schema);
  const result = await submitSurvey(visitorHash(vid), answer, comment);
  const res = json(result);
  res.headers.append(
    "Set-Cookie",
    `${PMF_COOKIE}=1; Max-Age=${60 * 60 * 24 * 365}; Path=/; SameSite=Lax${config.siteUrl.startsWith("https://") ? "; Secure" : ""}`,
  );
  return res;
});
