import { z } from "zod";
import { config } from "@/lib/config";
import { tooMany } from "@/lib/errors";
import { fingerprint } from "@/lib/fingerprint";
import { json, parseBody, route } from "@/lib/http";
import { newVisitorId, VISITOR_COOKIE, visitorHash } from "@/lib/metrics";
import { hit } from "@/lib/rate-limit";
import { saveTypeResult, typeDistribution } from "@/lib/repo/typeTests";
import { typeTestOf } from "@/lib/typeTests";

const cookieOf = (req: Request) => req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([0-9a-f-]{36})`))?.[1];

/** GET /api/type-test?test=키 — 🧩 타입 분포 (센 값만) */
export const GET = route(async (req) => {
  const key = new URL(req.url).searchParams.get("test");
  if (!typeTestOf(key)) return json(null);
  return json(await typeDistribution(key!));
});

const schema = z.object({ test: z.string().max(30), answers: z.array(z.number().int().min(0).max(3)).min(1).max(12) });

/** POST /api/type-test {test, answers} — 서버가 다시 채점해 익명으로 저장하고 분포를 돌려준다 */
export const POST = route(async (req) => {
  if (!(await hit(`type-test:${fingerprint(req.headers)}`, 60, 3600_000))) throw tooMany();
  const input = await parseBody(req, schema);
  const cookie = cookieOf(req);
  const vid = cookie ?? newVisitorId();
  const res = json(await saveTypeResult(input.test, visitorHash(vid), input.answers));
  if (!cookie) res.cookies.set(VISITOR_COOKIE, vid, { httpOnly: true, sameSite: "lax", secure: config.siteUrl.startsWith("https://"), maxAge: 60 * 60 * 24 * 365, path: "/" });
  return res;
});
